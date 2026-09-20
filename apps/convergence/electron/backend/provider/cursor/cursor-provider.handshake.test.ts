import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import type { ProviderDebugSink } from '../../provider-debug/provider-debug-sink'
import type { ProviderDebugEntry } from '../../provider-debug/provider-debug.types'
import { mapCursorCommandCatalog } from '../../skills/cursor-skills.mapper.pure'
import type { SkillSelection } from '../../skills/skills.types'
import type { SessionHandle } from '../provider.types'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
  type MockCursorAcpServer,
} from './cursor-acp-server.fixture'
import { CURSOR_ACP_RECORDED_INITIALIZE_RESULT } from './cursor-acp.recorded.fixture'
import { CursorAcpProcessClient } from './cursor-acp-client'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({ spawn: spawnMock }))

import { CursorProvider } from './cursor-provider'

const APP_VERSION = '4.2.1'

const MISSING_LOGIN_MESSAGE =
  'Cursor offers no login method Convergence knows (offered: other). Update Convergence or the Cursor CLI.'

/** The recorded handshake with one field rewritten. */
function initializeResult(patch: Record<string, unknown>): unknown {
  return { ...CURSOR_ACP_RECORDED_INITIALIZE_RESULT, ...patch }
}

function waitFor(
  assertion: () => void,
  timeoutMs = 400,
  intervalMs = 10,
): Promise<void> {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(error)
          return
        }
        setTimeout(attempt, intervalMs)
      }
    }
    attempt()
  })
}

function recordingSink(): {
  sink: ProviderDebugSink
  entries: ProviderDebugEntry[]
} {
  const entries: ProviderDebugEntry[] = []
  return {
    entries,
    sink: {
      record(entry) {
        entries.push(entry)
      },
    },
  }
}

/** A selection the live catalog cannot satisfy, so the one-off listing runs. */
function skillSelection(name: string): SkillSelection {
  const catalog = mapCursorCommandCatalog({
    availableCommands: [{ name, description: `${name} skill` }],
  })
  const entry = catalog.skills[0]
  if (!entry) throw new Error(`expected a catalog entry for ${name}`)

  return {
    id: entry.id,
    providerId: entry.providerId,
    providerName: entry.providerName,
    name: entry.name,
    displayName: entry.displayName,
    path: entry.path,
    scope: entry.scope,
    rawScope: entry.rawScope,
    sourceLabel: entry.sourceLabel,
    status: 'selected',
    argumentText: 'now',
  }
}

function methodCount(server: MockCursorAcpServer, method: string): number {
  return server.requests.filter((request) => request.method === method).length
}

function initializeParams(server: MockCursorAcpServer): {
  clientInfo?: { name?: string; version?: string }
} {
  const request = server.requests.find(
    (candidate) => candidate.method === 'initialize',
  )
  return (request?.params ?? {}) as {
    clientInfo?: { name?: string; version?: string }
  }
}

function notesOf(handle: SessionHandle): string[] {
  const notes: string[] = []
  handle.onDelta((delta: SessionDelta) => {
    if (delta.kind !== 'conversation.item.add') return
    if (delta.item.kind !== 'note') return
    notes.push((delta.item as unknown as { text: string }).text)
  })
  handle.onStatusChange(() => {})
  handle.onAttentionChange(() => {})
  handle.onContinuationToken(() => {})
  return notes
}

function startSession(options: { initializeResult?: unknown } = {}): {
  server: MockCursorAcpServer
  handle: SessionHandle
  notes: string[]
  entries: ProviderDebugEntry[]
} {
  const child = new MockCursorAcpChild()
  spawnMock.mockReturnValue(child)
  const server = createMockCursorAcp(child, {
    initializeResult: options.initializeResult,
  })
  const { sink, entries } = recordingSink()
  const provider = new CursorProvider('agent', sink, undefined, {
    appVersion: APP_VERSION,
  })
  const handle = provider.start({
    sessionId: 'session-1',
    workingDirectory: '/repo',
    initialMessage: 'hi',
    model: null,
    effort: null,
    continuationToken: null,
  })

  return { server, handle, notes: notesOf(handle), entries }
}

function mockSpawnedServer(options: { initializeResult?: unknown } = {}): {
  server: MockCursorAcpServer
} {
  const child = new MockCursorAcpChild()
  spawnMock.mockReturnValue(child)
  return {
    server: createMockCursorAcp(child, {
      initializeResult: options.initializeResult,
    }),
  }
}

afterEach(() => {
  spawnMock.mockReset()
  vi.useRealTimers()
})

describe('MAR-3145 R1 · one handshake serves every path', () => {
  it('sends exactly one initialize and one authenticate on the resident session', async () => {
    const { server, handle } = startSession()

    await waitFor(() => expect(methodCount(server, 'session/prompt')).toBe(1))

    expect(methodCount(server, 'initialize')).toBe(1)
    expect(methodCount(server, 'authenticate')).toBe(1)
    expect(
      server.requests.slice(0, 2).map((request) => request.method),
    ).toEqual(['initialize', 'authenticate'])
    handle.stop()
  })

  it('sends exactly one initialize and one authenticate on the one-shot', async () => {
    const { server } = mockSpawnedServer()
    const provider = new CursorProvider('agent', undefined, undefined, {
      appVersion: APP_VERSION,
    })

    const result = await provider.oneShot({
      prompt: 'hi',
      modelId: '',
      workingDirectory: '/repo',
      requestId: 'one-shot-1',
    })

    expect(result.text).toBe('hello world')
    expect(methodCount(server, 'initialize')).toBe(1)
    expect(methodCount(server, 'authenticate')).toBe(1)
  })

  it('sends exactly one initialize and one authenticate on the descriptor probe', async () => {
    const { server } = mockSpawnedServer()
    const provider = new CursorProvider('agent', undefined, undefined, {
      appVersion: APP_VERSION,
    })

    const descriptor = await provider.describe()

    expect(descriptor.modelOptions).toHaveLength(2)
    expect(methodCount(server, 'initialize')).toBe(1)
    expect(methodCount(server, 'authenticate')).toBe(1)
  })
})

describe('MAR-3145 R1 · the class: no second site can discard the handshake', () => {
  const cursorDir = fileURLToPath(new URL('.', import.meta.url))
  const handshakeDeclaration = 'export async function performCursorAcpHandshake'
  const requestLiterals = ["'initialize'", "'authenticate'"]

  function sourceFiles(): string[] {
    return readdirSync(cursorDir).filter(
      (name) =>
        name.endsWith('.ts') &&
        !name.includes('.test.') &&
        !name.includes('.fixture.'),
    )
  }

  function read(name: string): string {
    return readFileSync(join(cursorDir, name), 'utf8')
  }

  /**
   * The body of a top-level function, found by walking rather than by matching
   * a line: `request(` and its method literal have sat on two lines before now.
   */
  function bodyRange(source: string, declaration: string): [number, number] {
    const start = source.indexOf(declaration)
    expect(start, `${declaration} is missing`).toBeGreaterThanOrEqual(0)

    let parens = 0
    let bodyStart = -1
    for (let index = start; index < source.length; index += 1) {
      const char = source[index]
      if (char === '(') parens += 1
      else if (char === ')') parens -= 1
      else if (char === '{' && parens === 0) {
        bodyStart = index
        break
      }
    }
    expect(bodyStart, `${declaration} has no body`).toBeGreaterThanOrEqual(0)

    let depth = 0
    for (let index = bodyStart; index < source.length; index += 1) {
      const char = source[index]
      if (char === '{') depth += 1
      else if (char === '}') {
        depth -= 1
        if (depth === 0) return [bodyStart, index]
      }
    }
    throw new Error(`${declaration} has an unbalanced body`)
  }

  it('names the handshake request methods in no source file but the client and the catalog', () => {
    const offenders = sourceFiles().filter((name) => {
      if (name === 'cursor-acp-client.ts') return false
      if (name === 'cursor-acp-contract.pure.ts') return false
      const source = read(name)
      return requestLiterals.some((literal) => source.includes(literal))
    })

    expect(offenders).toEqual([])
  })

  it('keeps the contract catalog a list of names, not a caller', () => {
    expect(read('cursor-acp-contract.pure.ts')).not.toContain('.request(')
  })

  it('names them inside performCursorAcpHandshake and nowhere else in the client', () => {
    const source = read('cursor-acp-client.ts')
    const [start, end] = bodyRange(source, handshakeDeclaration)

    for (const literal of requestLiterals) {
      const positions: number[] = []
      let index = source.indexOf(literal)
      while (index >= 0) {
        positions.push(index)
        index = source.indexOf(literal, index + 1)
      }

      expect(positions, `${literal} is not sent at all`).toHaveLength(1)
      for (const position of positions) {
        expect(
          position > start && position < end,
          `${literal} is sent outside the one handshake`,
        ).toBe(true)
      }
    }
  })
})

describe('MAR-3145 R2 · the login method comes from the CLI', () => {
  const offersOther = {
    initializeResult: initializeResult({ authMethods: [{ id: 'other' }] }),
  }

  it('says so in the session note, and never guesses a login method', async () => {
    const { server, notes, handle } = startSession(offersOther)

    // The teardown's own "exited" note may follow; the refusal comes first.
    await waitFor(() => expect(notes.length).toBeGreaterThan(0))

    expect(notes[0]).toContain(MISSING_LOGIN_MESSAGE)
    expect(methodCount(server, 'authenticate')).toBe(0)
    handle.stop()
  })

  it('throws the same words out of the one-shot', async () => {
    const { server } = mockSpawnedServer(offersOther)
    const provider = new CursorProvider('agent', undefined, undefined, {
      appVersion: APP_VERSION,
    })

    await expect(
      provider.oneShot({
        prompt: 'hi',
        modelId: '',
        workingDirectory: '/repo',
        requestId: 'one-shot-2',
      }),
    ).rejects.toThrow(MISSING_LOGIN_MESSAGE)
    expect(methodCount(server, 'authenticate')).toBe(0)
  })

  it('throws the same words out of a disposable client', async () => {
    const { server } = mockSpawnedServer(offersOther)

    await expect(
      new CursorAcpProcessClient('agent').createSession('/repo'),
    ).rejects.toThrow(MISSING_LOGIN_MESSAGE)
    expect(methodCount(server, 'authenticate')).toBe(0)
  })

  // Lap 2, F1: silence is not a refusal. `authMethods` is optional in ACP, so a
  // CLI that names none has told us nothing — the app proceeds as it did before
  // this rule existed, and says so once.
  it.each([
    ['names no authMethods array at all', { protocolVersion: 1 }],
    ['names an empty authMethods array', initializeResult({ authMethods: [] })],
  ])(
    'authenticates anyway when the CLI %s, and notes it once',
    async (_label, result) => {
      const { server, notes, entries, handle } = startSession({
        initializeResult: result,
      })

      await waitFor(() => expect(methodCount(server, 'session/prompt')).toBe(1))

      expect(methodCount(server, 'authenticate')).toBe(1)
      expect(notes).toEqual([])
      expect(
        entries.filter(
          (entry) =>
            entry.note ===
            'Cursor named no login methods; trying cursor_login.',
        ),
      ).toHaveLength(1)
      handle.stop()
    },
  )

  it('notes a foreign protocol version once and carries on', async () => {
    const { server, entries, handle } = startSession({
      initializeResult: initializeResult({ protocolVersion: 3 }),
    })

    await waitFor(() => expect(methodCount(server, 'session/prompt')).toBe(1))

    const versionNotes = entries.filter((entry) =>
      entry.note?.includes('protocol version'),
    )
    expect(versionNotes).toHaveLength(1)
    expect(versionNotes[0]?.note).toContain('3')
    expect(versionNotes[0]?.note).toContain('(1)')
    expect(methodCount(server, 'authenticate')).toBe(1)
    handle.stop()
  })
})

describe('MAR-3145 R3 · a fallback is never remembered', () => {
  const liveSession = {
    sessionId: 'discovery-1',
    configOptions: [
      {
        id: 'model',
        currentValue: 'default[]',
        options: [
          { value: 'default[]', label: 'Auto' },
          { value: 'composer-2.5[]', label: 'Composer 2.5' },
        ],
      },
    ],
  }

  function providerWithFlakyProbe(): {
    provider: CursorProvider
    createSession: ReturnType<typeof vi.fn>
    entries: ProviderDebugEntry[]
  } {
    const createSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('cursor-agent is updating'))
      .mockResolvedValue(liveSession)
    const { sink, entries } = recordingSink()

    return {
      createSession,
      entries,
      provider: new CursorProvider('agent', sink, undefined, {
        appVersion: APP_VERSION,
        descriptorClient: { createSession },
      }),
    }
  }

  it('retries a failed probe after the floor, and caches only success', async () => {
    vi.useFakeTimers()
    const { provider, createSession, entries } = providerWithFlakyProbe()

    const first = await provider.describe()
    expect(first.modelOptions).toHaveLength(1)
    expect(createSession).toHaveBeenCalledTimes(1)

    // Inside the floor: the fallback again, and no second probe.
    vi.advanceTimersByTime(29_999)
    const second = await provider.describe()
    expect(second.modelOptions).toHaveLength(1)
    expect(createSession).toHaveBeenCalledTimes(1)

    // Past the floor: the real list.
    vi.advanceTimersByTime(1)
    const third = await provider.describe()
    expect(third.modelOptions).toHaveLength(2)
    expect(createSession).toHaveBeenCalledTimes(2)

    // And then it is remembered.
    vi.advanceTimersByTime(600_000)
    const fourth = await provider.describe()
    expect(fourth.modelOptions).toHaveLength(2)
    expect(createSession).toHaveBeenCalledTimes(2)

    const failures = entries.filter((entry) =>
      entry.note?.includes('Cursor model discovery failed'),
    )
    expect(failures).toHaveLength(1)
    expect(failures[0]?.note).toContain('cursor-agent is updating')
    // Lap 2, F3: nothing retries on a timer; the next call past the floor does.
    expect(failures[0]?.note).toContain(
      'the next request after 30s probes again.',
    )
  })

  it('shares one in-flight probe between concurrent callers', async () => {
    const { provider, createSession } = providerWithFlakyProbe()

    const [first, second] = await Promise.all([
      provider.describe(),
      provider.describe(),
    ])

    expect(first).toBe(second)
    expect(createSession).toHaveBeenCalledTimes(1)
  })
})

describe('MAR-3145 R4 · the app never introduces itself as 0.0.0', () => {
  it('names the real version on the resident session', async () => {
    const { server, handle } = startSession()

    await waitFor(() => expect(methodCount(server, 'initialize')).toBe(1))

    expect(initializeParams(server).clientInfo).toEqual({
      name: 'convergence',
      version: APP_VERSION,
    })
    handle.stop()
  })

  it('names the real version on the one-shot', async () => {
    const { server } = mockSpawnedServer()
    const provider = new CursorProvider('agent', undefined, undefined, {
      appVersion: APP_VERSION,
    })

    await provider.oneShot({
      prompt: 'hi',
      modelId: '',
      workingDirectory: '/repo',
      requestId: 'one-shot-3',
    })

    expect(initializeParams(server).clientInfo?.version).toBe(APP_VERSION)
  })

  it('names the real version on the descriptor probe', async () => {
    const { server } = mockSpawnedServer()
    const provider = new CursorProvider('agent', undefined, undefined, {
      appVersion: APP_VERSION,
    })

    await provider.describe()

    expect(initializeParams(server).clientInfo?.version).toBe(APP_VERSION)
  })

  // Lap 2, F2: the fourth construction path. The provider's own default skills
  // service spawns its own ACP process for a one-off command listing, and it
  // introduced the app as 0.0.0 until this lap.
  it('names the real version on the one-off skills listing', async () => {
    const mainChild = new MockCursorAcpChild()
    const mainServer = createMockCursorAcp(mainChild)
    const discoveryServers: MockCursorAcpServer[] = []

    spawnMock.mockImplementation(() => {
      if (spawnMock.mock.calls.length <= 1) return mainChild
      const discoveryChild = new MockCursorAcpChild()
      discoveryServers.push(createMockCursorAcp(discoveryChild))
      return discoveryChild
    })

    const provider = new CursorProvider('agent', undefined, undefined, {
      appVersion: APP_VERSION,
    })
    const handle = provider.start({
      sessionId: 'session-skills',
      workingDirectory: '/repo',
      initialMessage: 'hi',
      model: null,
      effort: null,
      continuationToken: null,
    })
    const statuses: string[] = []
    handle.onDelta(() => {})
    handle.onStatusChange((status) => statuses.push(status))
    handle.onAttentionChange(() => {})
    handle.onContinuationToken(() => {})

    await waitFor(() => expect(statuses).toContain('completed'))
    expect(methodCount(mainServer, 'initialize')).toBe(1)

    // No live catalog has arrived, so this falls through to the one-off
    // listing — a second spawn, and a second handshake.
    handle.sendMessage('use it', undefined, [skillSelection('alpha')])

    await waitFor(() => {
      expect(discoveryServers).toHaveLength(1)
      expect(
        methodCount(discoveryServers[0] as MockCursorAcpServer, 'initialize'),
      ).toBe(1)
    }, 3000)

    const discovery = discoveryServers.at(0)
    if (!discovery) throw new Error('the one-off skills listing never spawned')
    expect(initializeParams(discovery).clientInfo?.version).toBe(APP_VERSION)
    handle.stop()
  })
})
