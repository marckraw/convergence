vi.mock('./claude-transport.service', async () => ({
  createClaudeTransport: (await import('./claude-transport.fixture'))
    .createFixtureClaudeTransport,
}))
import { EventEmitter } from 'events'
import { isDeepStrictEqual } from 'util'

vi.mock('./claude-skill-telemetry.service', () => ({
  startClaudeSkillTelemetrySink: async () => {
    preparation.entered = true
    await preparation.gate
    return { env: { FIXTURE_TELEMETRY: '1' }, dispose: () => {} }
  },
}))
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock, preparation } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  preparation: {
    gate: undefined as Promise<void> | undefined,
    entered: false,
    envGate: undefined as Promise<void> | undefined,
    envCalls: 0,
    pauseAt: 0,
    envFailure: false,
    attachmentGate: undefined as Promise<void> | undefined,
    attachmentReads: 0,
  },
}))

vi.mock(
  '../../provider-account/provider-account-env.service',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../provider-account/provider-account-env.service')
      >()
    return {
      ...actual,
      resolveClaudeAccountEnv: async (
        input: Parameters<typeof actual.resolveClaudeAccountEnv>[0],
      ) => {
        preparation.envCalls++
        if (preparation.envCalls === preparation.pauseAt)
          await preparation.envGate
        if (preparation.envFailure)
          throw new Error('Account environment unavailable')
        return actual.resolveClaudeAccountEnv(input)
      },
    }
  },
)

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: async (
        ...args: Parameters<typeof actual.promises.readFile>
      ) => {
        if (args[0] === '/fixture/recovery-image.png') {
          preparation.attachmentReads++
          if (preparation.attachmentReads === 1)
            await preparation.attachmentGate
          return Buffer.from('fixture image')
        }
        // A per-account `.claude.json` whose bytes are truncated mid-write —
        // valid on disk, invalid JSON — so MAR-3030's "unreadable, not
        // absent" branch is reachable without touching the real filesystem.
        if (args[0] === '/fixture/unreadable-account/.claude.json') {
          return '{"oauthAccount": {"emailAddress": "unreadable@example.com"'
        }
        return actual.promises.readFile(...args)
      },
    },
  }
})

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { ClaudeCodeProvider } from './claude-code-provider'
import { ClaudeCodeSkillsService } from '../../skills/claude-code-skills.service'
import type { SkillSelection } from '../../skills/skills.types'
import type { ClaudeAccountLookup } from './claude-code-provider'
import type { SessionDelta } from '../../session/conversation-item.types'

function userAccounts(
  deltas: SessionDelta[],
): Array<string | null | undefined> {
  return deltas.flatMap((delta) =>
    delta.kind === 'conversation.item.add' &&
    delta.item.kind === 'message' &&
    delta.item.actor === 'user'
      ? [delta.providerAccountId]
      : [],
  )
}

const ACCOUNT_A = {
  configDir: '/home/.convergence/provider-accounts/claude/acct-a',
  credentialDir: '/home/.convergence/provider-credentials/claude/acct-a',
}
const ACCOUNT_B = {
  configDir: '/home/.convergence/provider-accounts/claude/acct-b',
  credentialDir: '/home/.convergence/provider-credentials/claude/acct-b',
}
/** Its `.claude.json` is the fixture truncated-JSON path mocked above. */
const ACCOUNT_UNREADABLE = {
  configDir: '/fixture/unreadable-account',
  credentialDir:
    '/home/.convergence/provider-credentials/claude/acct-unreadable',
}

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  private exited = false

  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    this.emitExit(0)
    return true
  })

  emitExit(code: number): void {
    if (this.exited) return
    this.exited = true
    this.emit('exit', code)
  }
}

function waitFor(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) return reject(error)
        setTimeout(attempt, 10)
      }
    }
    attempt()
  })
}

function spawnedEnv(call: number): NodeJS.ProcessEnv {
  const options = spawnMock.mock.calls[call]?.[2] as
    | { env?: NodeJS.ProcessEnv }
    | undefined
  return options?.env ?? {}
}

function attachListeners(handle: {
  onDelta: (cb: (delta: unknown) => void) => void
  onStatusChange: (cb: () => void) => void
  onAttentionChange: (cb: () => void) => void
  onContinuationToken: (cb: () => void) => void
  onContextWindowChange: (cb: () => void) => void
  onActivityChange: (cb: () => void) => void
}) {
  handle.onStatusChange(() => {})
  handle.onAttentionChange(() => {})
  handle.onContinuationToken(() => {})
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})
}

afterEach(() => {
  preparation.gate = undefined
  preparation.entered = false
  preparation.envGate = undefined
  preparation.envCalls = 0
  preparation.pauseAt = 0
  preparation.envFailure = false
  preparation.attachmentGate = undefined
  preparation.attachmentReads = 0
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('per-turn account attribution', () => {
  it('spawns a turn on the account the turn selected', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const lookup: ClaudeAccountLookup = (id) =>
      id === 'acct-a' ? ACCOUNT_A : null

    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      null,
      lookup,
    )
    const handle = provider.start({
      sessionId: 'session-account',
      workingDirectory: process.cwd(),
      initialMessage: 'hello',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
      providerAccountId: 'acct-a',
    })

    const deltas: SessionDelta[] = []
    handle.onDelta((delta) => deltas.push(delta))
    attachListeners(handle)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))

    expect(spawnedEnv(0).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_A.configDir)
    expect(userAccounts(deltas)).toEqual(['acct-a'])
    expect(spawnedEnv(0).CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
      ACCOUNT_A.credentialDir,
    )
  })

  it('surfaces a note when the account config cannot be read safely (MAR-3030)', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const lookup: ClaudeAccountLookup = (id) =>
      id === 'acct-unreadable' ? ACCOUNT_UNREADABLE : null

    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      null,
      lookup,
    )
    const handle = provider.start({
      sessionId: 'session-unreadable',
      workingDirectory: process.cwd(),
      initialMessage: 'hello',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
      providerAccountId: 'acct-unreadable',
    })

    const deltas: SessionDelta[] = []
    handle.onDelta((delta) => deltas.push(delta))
    attachListeners(handle)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))

    // The turn still spawns — an unreadable account config costs an MCP
    // server, never the wrong credential — but the note is visible in the
    // transcript rather than swallowed silently.
    expect(spawnedEnv(0).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_UNREADABLE.configDir)
    expect(
      deltas.some(
        (delta) =>
          delta.kind === 'conversation.item.add' &&
          delta.item.kind === 'note' &&
          delta.item.text.includes(
            `${ACCOUNT_UNREADABLE.configDir}/.claude.json`,
          ),
      ),
    ).toBe(true)
  })

  it('resolves nothing when no account was selected', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
    const handle = provider.start({
      sessionId: 'session-default',
      workingDirectory: process.cwd(),
      initialMessage: 'hello',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
    })

    const deltas: SessionDelta[] = []
    handle.onDelta((delta) => deltas.push(delta))
    attachListeners(handle)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))

    // Compare as a boolean so an ambient credential cannot enter a failure diff.
    expect(userAccounts(deltas)).toEqual([null])
    expect(
      isDeepStrictEqual(spawnedEnv(0), {
        ...process.env,
        FIXTURE_TELEMETRY: '1',
      }),
    ).toBe(true)
  })

  /**
   * The lying case. A recovery restart continues work the user already asked
   * for. If the account were re-resolved at spawn time, a selection made
   * meanwhile would silently move that work to a different subscription — and
   * Claude's transcript records no account attribution to contradict it later.
   */
  it('restarts a recovered turn on the account that started it', async () => {
    const first = new MockChildProcess()
    const restarted = new MockChildProcess()
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(restarted)

    let selected = 'acct-a'
    const lookup: ClaudeAccountLookup = (id) => {
      if (id === undefined || id === null) return null
      return id === 'acct-a' ? ACCOUNT_A : ACCOUNT_B
    }

    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      null,
      (id) => lookup(id ?? selected),
    )
    const handle = provider.start({
      sessionId: 'session-recovery',
      workingDirectory: process.cwd(),
      initialMessage: 'do the long thing',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: 'stale-session-id',
      providerAccountId: 'acct-a',
    })

    const deltas: SessionDelta[] = []
    handle.onDelta((delta) => deltas.push(delta))
    attachListeners(handle)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    expect(spawnedEnv(0).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_A.configDir)

    // The user picks another account while the turn is still in flight.
    selected = 'acct-b'

    // Claude rejects the stale continuation token: it dies without producing
    // any turn output, and Convergence restarts the same turn without it.
    first.stderr.write('No conversation found with session ID\n')
    first.emitExit(1)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))

    expect(spawnedEnv(1).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_A.configDir)
    expect(userAccounts(deltas)).toEqual(['acct-a'])
    expect(spawnedEnv(1).CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
      ACCOUNT_A.credentialDir,
    )
  })

  it('starts the next turn on a newly selected account', async () => {
    const first = new MockChildProcess()
    const second = new MockChildProcess()
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second)

    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      null,
      (id) =>
        id === 'acct-a' ? ACCOUNT_A : id === 'acct-b' ? ACCOUNT_B : null,
    )
    const handle = provider.start({
      sessionId: 'session-switch',
      workingDirectory: process.cwd(),
      initialMessage: 'first',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
      providerAccountId: 'acct-a',
    })

    const deltas: SessionDelta[] = []
    handle.onDelta((delta) => deltas.push(delta))
    attachListeners(handle)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    first.stdout.write(
      `${JSON.stringify({ type: 'result', is_error: false, result: 'ok' })}\n`,
    )
    first.emitExit(0)

    handle.sendMessage('second', undefined, undefined, {
      deliveryMode: 'interrupt',
      providerAccountId: 'acct-b',
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))

    // A genuinely new logical turn honours the new selection.
    expect(spawnedEnv(1).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_B.configDir)
    expect(userAccounts(deltas)).toEqual(['acct-a', 'acct-b'])
  })

  it('scopes a one-shot to the account the caller named', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      null,
      (id) => (id === 'acct-b' ? ACCOUNT_B : null),
    )
    const promise = provider.oneShot({
      prompt: 'name this session',
      modelId: 'sonnet',
      workingDirectory: process.cwd(),
      providerAccountId: 'acct-b',
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(Buffer.from('{"result":"ok"}'))
    child.stdout.end()
    child.emitExit(0)
    await promise

    expect(spawnedEnv(0).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_B.configDir)
  })
})

describe('account preparation boundary', () => {
  it.each(['normal', 'answer'] as const)(
    'queues a competing %s preparation without accepting or emitting its user turn',
    async (deliveryMode) => {
      let release!: () => void
      preparation.gate = new Promise<void>((resolve) => {
        release = resolve
      })
      spawnMock.mockReturnValue(new MockChildProcess())
      const provider = new ClaudeCodeProvider(
        '/usr/local/bin/claude',
        null,
        undefined,
        null,
        (id) => (id === 'acct-a' ? ACCOUNT_A : ACCOUNT_B),
      )
      const handle = provider.start({
        sessionId: 'preparing',
        workingDirectory: process.cwd(),
        initialMessage: 'first',
        model: null,
        effort: null,
        continuationToken: null,
        providerAccountId: 'acct-a',
      })
      const deltas: SessionDelta[] = []
      handle.onDelta((delta) => deltas.push(delta))
      attachListeners(handle)
      await waitFor(() => expect(preparation.entered).toBe(true))
      const accepted = vi.fn()
      const competing = handle.sendMessage('second', undefined, undefined, {
        deliveryMode,
        providerAccountId: 'acct-b',
        onTurnAccepted: accepted,
      })
      release()
      try {
        expect(await competing).toBe('queue-follow-up')
        await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
        expect(accepted).not.toHaveBeenCalled()
        expect(userAccounts(deltas)).toEqual(['acct-a'])
        expect(spawnedEnv(0).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_A.configDir)
      } finally {
        await handle.stop()
      }
    },
  )

  it('fails an initial account lookup before creating a user artifact', async () => {
    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      null,
      () => {
        throw new Error('Selected account is unavailable')
      },
    )
    const handle = provider.start({
      sessionId: 'unavailable',
      workingDirectory: process.cwd(),
      initialMessage: 'first',
      model: null,
      effort: null,
      continuationToken: null,
      providerAccountId: 'acct-a',
    })
    const deltas: SessionDelta[] = []
    const statuses: string[] = []
    handle.onDelta((delta) => deltas.push(delta))
    attachListeners(handle)
    handle.onStatusChange((status) => statuses.push(status))
    try {
      await waitFor(() => expect(statuses).toContain('failed'))
      expect(userAccounts(deltas)).toEqual([])
      expect(spawnMock).not.toHaveBeenCalled()
      expect(
        deltas.some(
          (delta) =>
            delta.kind === 'conversation.item.add' &&
            delta.item.kind === 'note' &&
            delta.item.text.includes('Selected account is unavailable'),
        ),
      ).toBe(true)
    } finally {
      await handle.stop()
    }
  })
})

it('queues an answer during recovery without rebinding the recovering account', async () => {
  const first = new MockChildProcess()
  const restarted = new MockChildProcess()
  spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(restarted)
  const provider = new ClaudeCodeProvider(
    '/usr/local/bin/claude',
    null,
    undefined,
    null,
    (id) => (id === 'acct-a' ? ACCOUNT_A : ACCOUNT_B),
  )
  const handle = provider.start({
    sessionId: 'recovery-race',
    workingDirectory: process.cwd(),
    initialMessage: 'first',
    model: null,
    effort: null,
    continuationToken: 'missing-thread',
    providerAccountId: 'acct-a',
  })
  const deltas: SessionDelta[] = []
  handle.onDelta((delta) => deltas.push(delta))
  attachListeners(handle)
  await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
  let release!: () => void
  preparation.pauseAt = 2
  preparation.envGate = new Promise<void>((resolve) => {
    release = resolve
  })
  first.stderr.write('No conversation found with session ID\n')
  first.emitExit(1)
  await waitFor(() => expect(preparation.envCalls).toBe(2))
  const accepted = vi.fn()
  const answer = handle.sendMessage('late answer', undefined, undefined, {
    deliveryMode: 'answer',
    providerAccountId: 'acct-b',
    onTurnAccepted: accepted,
  })
  release()
  try {
    expect(await answer).toBe('queue-follow-up')
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))
    expect(accepted).not.toHaveBeenCalled()
    expect(userAccounts(deltas)).toEqual(['acct-a'])
    expect(spawnedEnv(1).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_A.configDir)
  } finally {
    await handle.stop()
  }
})

it('does not accept or emit a user turn when environment binding fails', async () => {
  preparation.envFailure = true
  const provider = new ClaudeCodeProvider(
    '/usr/local/bin/claude',
    null,
    undefined,
    null,
    () => ACCOUNT_A,
  )
  const handle = provider.start({
    sessionId: 'env-failure',
    workingDirectory: process.cwd(),
    initialMessage: 'first',
    model: null,
    effort: null,
    continuationToken: null,
    providerAccountId: 'acct-a',
  })
  const deltas: SessionDelta[] = []
  const statuses: string[] = []
  handle.onDelta((delta) => deltas.push(delta))
  attachListeners(handle)
  handle.onStatusChange((status) => statuses.push(status))
  try {
    await waitFor(() => expect(statuses).toContain('failed'))
    const accepted = vi.fn()
    expect(
      await handle.sendMessage('retry', undefined, undefined, {
        deliveryMode: 'normal',
        providerAccountId: 'acct-a',
        onTurnAccepted: accepted,
      }),
    ).toEqual({
      kind: 'refused',
      reason: expect.stringContaining('Account environment unavailable'),
    })
    expect(accepted).not.toHaveBeenCalled()
    expect(userAccounts(deltas)).toEqual([])
    expect(spawnMock).not.toHaveBeenCalled()
  } finally {
    await handle.stop()
  }
})

it('retains recovery requested during the original attachment read', async () => {
  let release!: () => void
  preparation.attachmentGate = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = new MockChildProcess()
  const second = new MockChildProcess()
  let written = ''
  second.stdin.on('data', (chunk) => {
    written += chunk.toString()
  })
  spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second)
  const provider = new ClaudeCodeProvider(
    '/fixture/claude',
    null,
    undefined,
    null,
    () => ACCOUNT_A,
  )
  const handle = provider.start({
    sessionId: 'gated-attachment',
    workingDirectory: process.cwd(),
    initialMessage: 'read my image',
    model: null,
    effort: null,
    continuationToken: 'missing-thread',
    providerAccountId: 'acct-a',
    initialAttachments: [
      {
        id: 'image-a',
        sessionId: 'gated-attachment',
        kind: 'image',
        mimeType: 'image/png',
        filename: 'image.png',
        sizeBytes: 13,
        storagePath: '/fixture/recovery-image.png',
        thumbnailPath: null,
        textPreview: null,
        createdAt: '2026-01-01',
      },
    ],
  })
  const deltas: SessionDelta[] = []
  handle.onDelta((delta) => deltas.push(delta))
  attachListeners(handle)
  await waitFor(() => expect(preparation.attachmentReads).toBe(1))
  first.stderr.write('No conversation found with session ID\n')
  first.emitExit(1)
  release()
  try {
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(written).toContain('read my image'))
    expect(written).toContain('image')
    expect(userAccounts(deltas)).toEqual(['acct-a'])
    expect(spawnedEnv(1).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_A.configDir)
  } finally {
    await handle.stop()
  }
})

it('keeps the user message and failed skill selection after account binding', async () => {
  vi.spyOn(ClaudeCodeSkillsService.prototype, 'list').mockRejectedValue(
    new Error('Skill catalog unavailable'),
  )
  const provider = new ClaudeCodeProvider(
    '/fixture/claude',
    null,
    undefined,
    null,
    () => ACCOUNT_A,
  )
  const handle = provider.start({
    sessionId: 'skill-failure',
    workingDirectory: process.cwd(),
    initialMessage: 'first',
    model: null,
    effort: null,
    continuationToken: null,
    providerAccountId: 'acct-a',
  })
  const deltas: SessionDelta[] = []
  const statuses: string[] = []
  handle.onDelta((delta) => deltas.push(delta))
  attachListeners(handle)
  handle.onStatusChange((status) => statuses.push(status))
  // Refuse the initial lookup at env binding so this fixture has no live child.
  preparation.envFailure = true
  await waitFor(() => expect(statuses).toContain('failed'))
  preparation.envFailure = false
  const accepted = vi.fn()
  const selection: SkillSelection = {
    id: 'skill-a',
    providerId: 'claude-code',
    providerName: 'Claude Code',
    name: 'skill-a',
    displayName: 'Skill A',
    path: '/fixture/SKILL.md',
    scope: 'project' as const,
    rawScope: null,
    sourceLabel: 'fixture',
    status: 'selected' as const,
  }
  try {
    const result = await handle.sendMessage(
      'do this with my skill',
      undefined,
      [selection],
      {
        deliveryMode: 'normal',
        providerAccountId: 'acct-a',
        onTurnAccepted: accepted,
      },
    )
    expect(result).toBeUndefined()
    expect(accepted).toHaveBeenCalledOnce()
    expect(userAccounts(deltas)).toEqual(['acct-a'])
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'conversation.item.add',
          providerAccountId: 'acct-a',
          item: expect.objectContaining({
            actor: 'user',
            text: 'do this with my skill',
            skillSelections: [
              expect.objectContaining({ id: 'skill-a', status: 'failed' }),
            ],
          }),
        }),
      ]),
    )
    expect(spawnMock).not.toHaveBeenCalled()
  } finally {
    await handle.stop()
  }
})
