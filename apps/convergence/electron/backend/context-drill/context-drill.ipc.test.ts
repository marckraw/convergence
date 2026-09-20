import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerContextDrillIpcHandlers } from './context-drill.ipc'
import { ContextDrillService, DRILL_NOT_RUNNING } from './context-drill.service'
import type { ContextDrillSessionGateway } from './context-drill.types'

const handlers = new Map<
  string,
  (event: unknown, ...args: never[]) => unknown
>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown) => unknown) => {
      handlers.set(channel, handler)
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
}))

function invoke<T>(channel: string, ...args: unknown[]): T {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler for ${channel}`)
  return (handler as (event: unknown, ...rest: unknown[]) => T)(null, ...args)
}

class StubSessions implements ContextDrillSessionGateway {
  mastermind = true
  readiness: { ready: true } | { ready: false; reason: string } = {
    ready: true,
  }
  sent: string[] = []
  release: (() => void) | null = null

  isMastermindSeat(): boolean {
    return this.mastermind
  }
  describeCompactionReadiness() {
    return this.readiness
  }
  onSessionSettled(): () => void {
    return () => {}
  }
  holdQueue(): void {}
  releaseQueue(): void {}
  async sendDrillBeat(_sessionId: string, text: string): Promise<string> {
    this.sent.push(text)
    // Never settles: the run parks on the first beat, which is how a test
    // can look at a routine while it is running.
    await new Promise<void>((resolve) => {
      this.release = resolve
    })
    return 'dispatch-1'
  }
  getLastAssistantMessageText(): string | null {
    return null
  }
  async compactContext(): Promise<unknown> {
    return {}
  }
  addContextDrillNote(): void {}
}

let sessions: StubSessions
let service: ContextDrillService

beforeEach(() => {
  handlers.clear()
  sessions = new StubSessions()
  service = new ContextDrillService({ sessions })
  registerContextDrillIpcHandlers({ service })
})

describe('contextDrill:describe (MAR-3255 R6)', () => {
  it('does not offer the drill on a seat that is not a mastermind', () => {
    sessions.mastermind = false
    expect(invoke('contextDrill:describe', 's')).toMatchObject({
      offered: false,
      beat: null,
    })
  })

  it('does not offer the drill on a conversation that cannot compact', () => {
    sessions.readiness = { ready: false, reason: 'Wait for the pending send' }
    expect(invoke('contextDrill:describe', 's')).toEqual({
      offered: false,
      reason: 'Wait for the pending send',
      beat: null,
    })
  })

  it('offers the drill on a ready mastermind conversation', () => {
    expect(invoke('contextDrill:describe', 's')).toEqual({
      offered: true,
      reason: null,
      beat: null,
    })
  })

  it('names the beat while a routine is running', async () => {
    void invoke('contextDrill:run', 's')
    await vi.waitFor(() => expect(sessions.sent).toHaveLength(1))
    expect(invoke('contextDrill:describe', 's')).toMatchObject({
      beat: 'sealing',
    })
    sessions.release?.()
  })
})

describe('contextDrill:run (MAR-3255 R6)', () => {
  it('answers a refusal as a value, not as a rejection', async () => {
    sessions.mastermind = false
    await expect(
      invoke<Promise<unknown>>('contextDrill:run', 's'),
    ).resolves.toMatchObject({ ok: false, beat: 'sealing' })
  })
})

describe('contextDrill:cancel (MAR-3255 R8)', () => {
  it('ends a routine that is waiting, through the channel', async () => {
    const run = invoke<Promise<unknown>>('contextDrill:run', 's')
    await vi.waitFor(() => expect(sessions.sent).toHaveLength(1))

    expect(invoke('contextDrill:cancel', 's')).toEqual({ ok: true })
    sessions.release?.()
    await expect(run).resolves.toMatchObject({ ok: false, beat: 'sealing' })
    expect(invoke('contextDrill:describe', 's')).toMatchObject({ beat: null })
  })

  it('answers a refusal as a value here too', () => {
    expect(invoke('contextDrill:cancel', 's')).toEqual({
      ok: false,
      reason: DRILL_NOT_RUNNING,
    })
  })
})
