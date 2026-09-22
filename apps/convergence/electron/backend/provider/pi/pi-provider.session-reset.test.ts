import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import type { SessionHandle, SessionStatus } from '../provider.types'
import { ProviderBusyError } from '../provider.types'
import {
  CONTEXT_RESTARTED_NOTE_TEXT,
  SESSION_RESTARTED_EVENT_TYPE,
} from '../session-restart.pure'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({ spawn: spawnMock }))

import { PiProvider } from './pi-provider'

/**
 * MAR-3215: `/clear` on a Pi seat. A fake `pi --mode rpc` that records every
 * command and answers in the shapes measured on Pi 0.85.1:
 * `new_session` → `{success:true, data:{cancelled:false}}`, then `get_state`
 * names a different `sessionFile`.
 */
class FakePi extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  readonly requests: Array<{ type?: string; message?: string; id?: number }> =
    []
  private exited = false

  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.emitExit(null)
    return true
  })

  constructor(
    private readonly world: {
      sessionFile: string | null
      nextSessionFiles: string[]
      newSession: 'switch' | 'cancel' | 'refuse' | 'switch-without-file'
      holdPrompts: boolean
      stateFails?: boolean
    },
  ) {
    super()
    let buffer = ''
    this.stdin.on('data', (chunk) => {
      buffer += chunk.toString()
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) this.answer(JSON.parse(line))
        newline = buffer.indexOf('\n')
      }
    })
  }

  emitExit(code: number | null): void {
    if (this.exited) return
    this.exited = true
    this.exitCode = code
    this.emit('exit', code, code === null ? 'SIGTERM' : null)
  }

  private write(message: unknown): void {
    this.stdout.write(JSON.stringify(message) + '\n')
  }

  private answer(message: { type?: string; message?: string; id?: number }) {
    this.requests.push(message)
    const respond = (extra: Record<string, unknown>) =>
      setTimeout(() =>
        this.write({
          type: 'response',
          command: message.type,
          id: message.id,
          ...extra,
        }),
      )
    switch (message.type) {
      case 'prompt':
        respond({ success: true })
        if (this.world.holdPrompts) return
        setTimeout(() => {
          this.write({ type: 'agent_start' })
          this.write({
            type: 'agent_end',
            willRetry: false,
            messages: [{ role: 'assistant', stopReason: 'stop' }],
          })
          this.write({ type: 'agent_settled' })
        }, 5)
        return
      case 'get_state':
        if (this.world.stateFails) {
          respond({ success: false, error: 'state unavailable' })
          return
        }
        respond({
          success: true,
          data: this.world.sessionFile
            ? { sessionFile: this.world.sessionFile, isStreaming: false }
            : { isStreaming: false },
        })
        return
      case 'new_session':
        if (this.world.newSession === 'refuse') {
          respond({ success: false, error: 'no session manager' })
          return
        }
        if (this.world.newSession === 'cancel') {
          respond({ success: true, data: { cancelled: true } })
          return
        }
        if (this.world.newSession === 'switch') {
          this.world.sessionFile = this.world.nextSessionFiles.shift() ?? null
        }
        respond({ success: true, data: { cancelled: false } })
        return
      case 'get_session_stats':
        respond({ success: true, data: {} })
        return
    }
  }
}

function waitFor(assertion: () => void, timeoutMs = 600): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) reject(error)
        else setTimeout(attempt, 5)
      }
    }
    attempt()
  })
}

type Note = { text: string; providerEventType: string | null }

function observe(handle: SessionHandle) {
  const notes: Note[] = []
  const statuses: SessionStatus[] = []
  const tokens: string[] = []
  const patchedTokens: Array<string | null | undefined> = []
  handle.onDelta((delta: SessionDelta) => {
    if (delta.kind === 'conversation.item.add' && delta.item.kind === 'note') {
      notes.push({
        text: (delta.item as unknown as { text: string }).text,
        providerEventType: delta.item.providerMeta.providerEventType ?? null,
      })
    }
    if (
      delta.kind === 'session.patch' &&
      delta.patch.continuationToken !== undefined
    ) {
      patchedTokens.push(delta.patch.continuationToken)
    }
  })
  handle.onStatusChange((status) => statuses.push(status))
  handle.onAttentionChange(() => {})
  handle.onContinuationToken((token) => tokens.push(token))
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})
  return {
    notes,
    statuses,
    tokens,
    patchedTokens,
    boundaries: () =>
      notes.filter(
        (note) => note.providerEventType === SESSION_RESTARTED_EVENT_TYPE,
      ),
  }
}

function setup(world: Partial<ConstructorParameters<typeof FakePi>[0]> = {}): {
  spawned: FakePi[]
  world: ConstructorParameters<typeof FakePi>[0]
} {
  const fullWorld = {
    sessionFile: '/s/one.jsonl',
    nextSessionFiles: ['/s/two.jsonl'],
    newSession: 'switch' as const,
    holdPrompts: false,
    ...world,
  }
  const spawned: FakePi[] = []
  spawnMock.mockImplementation(() => {
    const child = new FakePi(fullWorld)
    spawned.push(child)
    return child
  })
  return { spawned, world: fullWorld }
}

function start(
  initialMessage: string,
  continuationToken: string | null = null,
): SessionHandle {
  return new PiProvider('/usr/local/bin/pi').start({
    sessionId: 'pi-reset',
    workingDirectory: '/repo',
    initialMessage,
    model: null,
    effort: null,
    continuationToken,
  })
}

const spawnArgs = (index: number): string[] =>
  spawnMock.mock.calls[index]?.[1] as string[]

describe('PiProvider /clear on a live, idle process (MAR-3215)', () => {
  afterEach(() => spawnMock.mockReset())

  async function liveIdleSession() {
    const env = setup()
    const handle = start('hello')
    const seen = observe(handle)
    await waitFor(() => {
      expect(seen.statuses.at(-1)).toBe('completed')
      expect(seen.tokens).toEqual(['/s/one.jsonl'])
    })
    return { ...env, handle, seen }
  }

  it('R1: sends new_session and no prompt — fall through to prompt turns red', async () => {
    const { spawned, handle, seen } = await liveIdleSession()

    handle.sendMessage('/clear')

    await waitFor(() => expect(seen.statuses.at(-1)).toBe('completed'))
    await waitFor(() => expect(seen.boundaries()).toHaveLength(1))
    expect(spawned).toHaveLength(1)
    expect(spawned[0].requests.map((request) => request.type)).toEqual([
      'prompt',
      'get_state',
      'new_session',
      'get_state',
    ])
    expect(
      spawned[0].requests.filter((request) => request.message === '/clear'),
    ).toEqual([])
    handle.stop()
  })

  it('R2: the new file is the conversation from then on, across a respawn — keep the old token turns red', async () => {
    const { spawned, handle, seen } = await liveIdleSession()

    handle.sendMessage('/clear')
    await waitFor(() => expect(seen.boundaries()).toHaveLength(1))
    expect(seen.tokens).toEqual(['/s/one.jsonl', '/s/two.jsonl'])
    expect(seen.patchedTokens.at(-1)).toBe('/s/two.jsonl')

    // The process ends (the session layer releases a Pi handle after every
    // completed turn); the next message must resume the NEW file.
    spawned[0].emitExit(0)
    handle.sendMessage('after the clear')
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))
    expect(spawnArgs(1)).toEqual(['--mode', 'rpc', '--session', '/s/two.jsonl'])
    handle.stop()
  })

  it('R3 + R4: an extension veto settles failed, says so, draws no boundary and keeps the old file — treat cancelled as success turns red', async () => {
    const { spawned, world, handle, seen } = await liveIdleSession()
    world.newSession = 'cancel'

    handle.sendMessage('/clear')

    await waitFor(() => expect(seen.statuses.at(-1)).toBe('failed'))
    expect(seen.boundaries()).toEqual([])
    expect(seen.notes.at(-1)?.text).toBe(
      'Could not clear the conversation: a Pi extension cancelled the new session. The previous conversation is still active; your next message will resume it.',
    )
    expect(seen.tokens).toEqual(['/s/one.jsonl'])
    expect(spawned[0].requests.at(-1)?.type).toBe('new_session')
    handle.stop()
  })

  it('R3: a refused new_session settles failed with no boundary', async () => {
    const { world, handle, seen } = await liveIdleSession()
    world.newSession = 'refuse'

    handle.sendMessage('/clear')

    await waitFor(() => expect(seen.statuses.at(-1)).toBe('failed'))
    expect(seen.boundaries()).toEqual([])
    expect(seen.notes.at(-1)?.text).toContain(
      'Pi refused new_session: no session manager.',
    )
    expect(seen.tokens).toEqual(['/s/one.jsonl'])
    handle.stop()
  })

  it('refuses to call a switch with no reported file a reset, and ends the process so the next message resumes the old file', async () => {
    const { spawned, world, handle, seen } = await liveIdleSession()
    world.newSession = 'switch-without-file'

    handle.sendMessage('/clear')

    await waitFor(() => expect(seen.statuses.at(-1)).toBe('failed'))
    expect(seen.boundaries()).toEqual([])
    expect(seen.notes.at(-1)?.text).toContain(
      'Pi opened a new session but did not report its file.',
    )
    expect(spawned[0].kill).toHaveBeenCalled()
    handle.sendMessage('next')
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))
    expect(spawnArgs(1)).toEqual(['--mode', 'rpc', '--session', '/s/one.jsonl'])
    handle.stop()
  })

  it('R4: refuses a reset while a turn is running, typed so a relay queues it — remove the busy guard turns red', async () => {
    setup({ holdPrompts: true })
    const handle = start('hello')
    const seen = observe(handle)
    await waitFor(() => expect(seen.statuses.at(-1)).toBe('running'))

    expect(() => handle.sendMessage('/clear')).toThrow(ProviderBusyError)
    expect(() => handle.sendMessage('/clear')).toThrow(
      'Wait for the current turn to finish before clearing the conversation.',
    )
    handle.stop()
  })

  it('R4: refuses a reset while a turn is still arriving — before the start fires, and while a spawn is in flight', async () => {
    const { spawned } = setup()
    const handle = start('hello')
    const seen = observe(handle)
    // The start's turn has not even been spawned yet.
    expect(() => handle.sendMessage('/clear')).toThrow(ProviderBusyError)

    await waitFor(() => expect(seen.statuses.at(-1)).toBe('completed'))
    spawned[0].emitExit(0)
    // No process: this message spawns one, and the spawn has not reached
    // its first status when the reset asks.
    handle.sendMessage('again')
    expect(() => handle.sendMessage('/clear')).toThrow(ProviderBusyError)
    handle.stop()
  })
})

describe('PiProvider /clear with no live process (MAR-3215)', () => {
  afterEach(() => spawnMock.mockReset())

  it('R5: replaces the token with a fresh file from a probe that is sent no prompt — send /clear as the initial prompt turns red', async () => {
    const { spawned, world } = setup({ sessionFile: '/s/fresh.jsonl' })
    world.sessionFile = '/s/fresh.jsonl'
    const handle = start('/clear', '/s/old.jsonl')
    const seen = observe(handle)

    await waitFor(() => expect(seen.statuses.at(-1)).toBe('completed'))
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnArgs(0)).toEqual(['--mode', 'rpc'])
    expect(spawned[0].requests.map((request) => request.type)).toEqual([
      'get_state',
    ])
    expect(spawned[0].kill).toHaveBeenCalled()
    expect(seen.tokens).toEqual(['/s/old.jsonl', '/s/fresh.jsonl'])
    expect(seen.patchedTokens).toEqual(['/s/fresh.jsonl'])
    expect(seen.boundaries()).toEqual([
      {
        text: CONTEXT_RESTARTED_NOTE_TEXT,
        providerEventType: SESSION_RESTARTED_EVENT_TYPE,
      },
    ])

    handle.sendMessage('after the clear')
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))
    expect(spawnArgs(1)).toEqual([
      '--mode',
      'rpc',
      '--session',
      '/s/fresh.jsonl',
    ])
    handle.stop()
  })

  it('R5: a conversation that never named a session spawns nothing and draws no boundary', async () => {
    setup()
    const handle = start('/clear', null)
    const seen = observe(handle)

    await waitFor(() => expect(seen.statuses.at(-1)).toBe('completed'))
    expect(spawnMock).not.toHaveBeenCalled()
    expect(seen.boundaries()).toEqual([])
    expect(seen.tokens).toEqual([])
    handle.stop()
  })

  it('R3: a probe that cannot name the new file settles failed, keeps the old file, draws no boundary', async () => {
    setup({ stateFails: true })
    const handle = start('/clear', '/s/old.jsonl')
    const seen = observe(handle)

    await waitFor(() => expect(seen.statuses.at(-1)).toBe('failed'))
    expect(seen.boundaries()).toEqual([])
    expect(seen.notes.at(-1)?.text).toBe(
      'Could not clear the conversation: state unavailable. The previous conversation is still active; your next message will resume it.',
    )
    expect(seen.tokens).toEqual(['/s/old.jsonl'])
    handle.stop()
  })

  it('MAR-3298 R1: a silent first probe is retried; the second naming the file restarts — drop the retry turns red', async () => {
    vi.useFakeTimers()
    try {
      const spawned: FakePi[] = []
      let probeCount = 0
      spawnMock.mockImplementation(() => {
        probeCount += 1
        if (probeCount === 1) {
          const silent = new FakePi({
            sessionFile: null,
            nextSessionFiles: [],
            newSession: 'switch',
            holdPrompts: true,
          })
          silent.stdin.removeAllListeners('data')
          spawned.push(silent)
          return silent
        }
        const world = {
          sessionFile: '/s/fresh.jsonl',
          nextSessionFiles: [] as string[],
          newSession: 'switch' as const,
          holdPrompts: false,
        }
        const child = new FakePi(world)
        spawned.push(child)
        return child
      })
      const handle = start('/clear', '/s/old.jsonl')
      const seen = observe(handle)
      // Provider start timer (10ms), then the first silent probe's timeout.
      await vi.advanceTimersByTimeAsync(10)
      expect(spawned).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(20_000)
      // Second probe answers get_state on a 0ms setTimeout inside FakePi.
      await vi.advanceTimersByTimeAsync(50)
      await Promise.resolve()
      await Promise.resolve()
      expect(seen.statuses.at(-1)).toBe('completed')
      expect(spawned).toHaveLength(2)
      expect(seen.boundaries()).toHaveLength(1)
      expect(
        seen.notes.some((note) => note.text.includes('Could not clear')),
      ).toBe(false)
      handle.dispose?.()
    } finally {
      vi.useRealTimers()
    }
  })

  it('MAR-3298 R1: two silent probes fail with the two-attempt sentence — shorten the note turns red', async () => {
    vi.useFakeTimers()
    try {
      const spawned: FakePi[] = []
      spawnMock.mockImplementation(() => {
        const silent = new FakePi({
          sessionFile: null,
          nextSessionFiles: [],
          newSession: 'switch',
          holdPrompts: true,
        })
        silent.stdin.removeAllListeners('data')
        spawned.push(silent)
        return silent
      })
      const handle = start('/clear', '/s/old.jsonl')
      const seen = observe(handle)
      await vi.advanceTimersByTimeAsync(10)
      await vi.advanceTimersByTimeAsync(20_000)
      await vi.advanceTimersByTimeAsync(20_000)
      await Promise.resolve()
      await Promise.resolve()
      expect(seen.statuses.at(-1)).toBe('failed')
      expect(spawned).toHaveLength(2)
      expect(seen.notes.at(-1)?.text).toBe(
        'Could not clear the conversation: Pi did not name its new session in time (2 × 20 s). The previous conversation is still active; your next message will resume it.',
      )
      handle.dispose?.()
    } finally {
      vi.useRealTimers()
    }
  })

  it('MAR-3298 R1: a probe that answers with a refusal is not retried — retry on refusal turns red', async () => {
    setup({ stateFails: true })
    const handle = start('/clear', '/s/old.jsonl')
    const seen = observe(handle)
    await waitFor(() => expect(seen.statuses.at(-1)).toBe('failed'))
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(seen.notes.at(-1)?.text).toContain('state unavailable')
    expect(seen.notes.at(-1)?.text).not.toContain('2 × 20 s')
    handle.stop()
  })

  it('MAR-3298 lap 2 C: a first probe that exits is retried; the second naming the file restarts — ME retry on timeout only turns red', async () => {
    vi.useFakeTimers()
    try {
      const spawned: FakePi[] = []
      let probeCount = 0
      spawnMock.mockImplementation(() => {
        probeCount += 1
        if (probeCount === 1) {
          const exiting = new FakePi({
            sessionFile: null,
            nextSessionFiles: [],
            newSession: 'switch',
            holdPrompts: true,
          })
          exiting.stdin.removeAllListeners('data')
          spawned.push(exiting)
          // Exit before naming a session — not a timeout (MAR-3298 lap 2 C).
          setTimeout(() => exiting.emitExit(1), 0)
          return exiting
        }
        const child = new FakePi({
          sessionFile: '/s/fresh.jsonl',
          nextSessionFiles: [],
          newSession: 'switch',
          holdPrompts: false,
        })
        spawned.push(child)
        return child
      })
      const handle = start('/clear', '/s/old.jsonl')
      const seen = observe(handle)
      await vi.advanceTimersByTimeAsync(10)
      await vi.advanceTimersByTimeAsync(50)
      await Promise.resolve()
      await Promise.resolve()
      expect(seen.statuses.at(-1)).toBe('completed')
      expect(spawned).toHaveLength(2)
      expect(seen.boundaries()).toHaveLength(1)
      expect(
        seen.notes.some((note) => note.text.includes('Could not clear')),
      ).toBe(false)
      handle.dispose?.()
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses a message while the reset is under way rather than racing it', () => {
    setup()
    const handle = start('/clear', '/s/old.jsonl')
    observe(handle)
    expect(() => handle.sendMessage('too soon')).toThrow(ProviderBusyError)
    expect(spawnMock).not.toHaveBeenCalled()
    handle.stop()
  })

  it('kills the probe when the session is disposed mid-reset', async () => {
    const { spawned } = setup({ holdPrompts: true })
    // A probe that never answers get_state.
    spawnMock.mockImplementation(() => {
      const child = new FakePi({
        sessionFile: null,
        nextSessionFiles: [],
        newSession: 'switch',
        holdPrompts: true,
      })
      child.stdin.removeAllListeners('data')
      spawned.push(child)
      return child
    })
    const handle = start('/clear', '/s/old.jsonl')
    observe(handle)
    await waitFor(() => expect(spawned).toHaveLength(1))
    handle.dispose?.()
    expect(spawned[0].kill).toHaveBeenCalled()
  })
})
