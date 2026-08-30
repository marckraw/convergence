import { describe, expect, it, vi } from 'vitest'
import { ProviderDebugService } from './provider-debug.service'
import type { ProviderDebugEntry } from './provider-debug.types'

function makeEntry(
  sessionId: string,
  seq: number,
  overrides: Partial<ProviderDebugEntry> = {},
): ProviderDebugEntry {
  return {
    sessionId,
    providerId: 'codex',
    at: seq,
    direction: 'in',
    channel: 'notification',
    method: `m-${seq}`,
    ...overrides,
  }
}

describe('ProviderDebugService', () => {
  it('appends entries to the per-session ring and broadcasts', () => {
    const broadcast = vi.fn()
    const service = new ProviderDebugService({ broadcast })

    const entry = makeEntry('s1', 1)
    service.record(entry)

    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith('provider:debug:event', entry)
    expect(service.list('s1')).toEqual([entry])
  })

  it('keeps separate rings per session', () => {
    const service = new ProviderDebugService({ broadcast: vi.fn() })
    service.record(makeEntry('s1', 1))
    service.record(makeEntry('s2', 1))
    service.record(makeEntry('s1', 2))

    expect(service.list('s1')).toHaveLength(2)
    expect(service.list('s2')).toHaveLength(1)
  })

  it('returns a copy of the ring entries (defensive)', () => {
    const service = new ProviderDebugService({ broadcast: vi.fn() })
    service.record(makeEntry('s1', 1))
    const list = service.list('s1')
    list.push(makeEntry('s1', 999))
    expect(service.list('s1')).toHaveLength(1)
  })

  it('drop forgets a session ring', () => {
    const service = new ProviderDebugService({ broadcast: vi.fn() })
    service.record(makeEntry('s1', 1))
    expect(service.list('s1')).toHaveLength(1)
    service.drop('s1')
    expect(service.list('s1')).toEqual([])
  })

  it('evicts the least recently recorded session ring at the session cap', () => {
    const service = new ProviderDebugService({
      broadcast: vi.fn(),
      maxSessionRings: 2,
    })
    service.record(makeEntry('s1', 1))
    service.record(makeEntry('s2', 1))
    service.record(makeEntry('s1', 2))
    service.record(makeEntry('s3', 1))

    expect(service.list('s1')).toHaveLength(2)
    expect(service.list('s2')).toEqual([])
    expect(service.list('s3')).toHaveLength(1)
  })

  it('does not retain oversized provider payloads', () => {
    const service = new ProviderDebugService({ broadcast: vi.fn() })
    service.record(
      makeEntry('s1', 1, {
        payload: { output: 'x'.repeat(64 * 1024) },
      }),
    )

    expect(service.list('s1')[0]?.payload).toEqual({
      truncated: true,
      bytes: expect.any(Number),
    })
  })

  it('writes JSONL only when logging is enabled', () => {
    const writes: Array<{ sessionId: string; line: string }> = []
    const jsonl = {
      writeLine: (sessionId: string, line: string) =>
        writes.push({ sessionId, line }),
      cleanup: () => {
        // not needed for this test
      },
    }
    let enabled = false
    const service = new ProviderDebugService({
      broadcast: vi.fn(),
      jsonl,
      isLoggingEnabled: () => enabled,
    })

    service.record(makeEntry('s1', 1))
    expect(writes).toHaveLength(0)

    enabled = true
    service.record(makeEntry('s1', 2))
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ sessionId: 's1' })
    expect(JSON.parse(writes[0]!.line).at).toBe(2)
  })
})

/**
 * A sink is a side channel, and a side channel that can throw is a side channel
 * that can retract the thing it was describing (MAR-2694 round 2).
 *
 * `record` is called from fire-and-forget paths — most sharply from the remote
 * host's `run()`, one statement after the daemon has answered 201 and before
 * the event stream opens. A throw there became an unhandled rejection: one
 * start posted, a run the daemon was holding, and no stream ever opened, all
 * because a renderer had gone away between `isDestroyed()` and `send`, or a
 * disk was full. Telemetry may fail; it may not take the run with it.
 *
 * So the contract is the sink's, not each caller's: every consequence inside
 * `record` is guarded on its own, and a failure is reported to `console.error`
 * — the last resort, because a sink cannot report into itself.
 */
describe('the provider-debug sink is a no-throw side channel', () => {
  it('keeps recording when the broadcast throws, and says so out loud', () => {
    const errors: unknown[][] = []
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        errors.push(args)
      })
    const service = new ProviderDebugService({
      broadcast: () => {
        throw new Error('renderer went away')
      },
    })

    expect(() => service.record(makeEntry('s1', 1))).not.toThrow()
    // The ring is the sink's own memory and it still holds the entry: the
    // failure was the broadcast's, and the debug panel that reads the ring on
    // open must not lose the line because a live listener died.
    expect(service.list('s1')).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(String(errors[0]?.[0])).toContain('provider-debug')

    consoleError.mockRestore()
  })

  /**
   * Each consequence guarded on its own, not one `try` around all three: the
   * JSONL file is the audit trail that answers "was a second start attempted?"
   * (MAR-2582), and a broadcast failure that silently skipped the write would
   * make that log lie by omission at exactly the moment it matters.
   *
   * Mutation: wrap the body of `record` in one `try/catch` instead of guarding
   * each consequence and this goes red.
   */
  it('still writes the JSONL line when the broadcast threw', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const writes: string[] = []
    const service = new ProviderDebugService({
      broadcast: () => {
        throw new Error('renderer went away')
      },
      jsonl: {
        writeLine: (_sessionId: string, line: string) => writes.push(line),
        cleanup: () => {},
      },
      isLoggingEnabled: () => true,
    })

    service.record(makeEntry('s1', 1))

    expect(writes).toHaveLength(1)
    consoleError.mockRestore()
  })

  /**
   * The disk half of the same rule. `createJsonlWriter` swallows its own
   * failures today, but the contract belongs to the sink rather than to one
   * writer implementation — a different writer, or a `cleanup` that throws on
   * a full disk, must not be able to reach the caller either.
   *
   * Mutation: remove the guard around the JSONL write in `record` and this goes
   * red.
   */
  it('keeps recording when the JSONL write throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broadcast = vi.fn()
    const service = new ProviderDebugService({
      broadcast,
      jsonl: {
        writeLine: () => {
          throw new Error('disk full')
        },
        cleanup: () => {},
      },
      isLoggingEnabled: () => true,
    })

    expect(() => service.record(makeEntry('s1', 1))).not.toThrow()
    // The broadcast ran before the write and is not undone by it.
    expect(broadcast).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  /**
   * The console is the last resort and it can be gone too — Electron's main
   * process has had a `console` that throws once the app is quitting. A sink
   * whose reporter throws must still not reach its caller.
   *
   * Mutation: report the failure outside the guard (or drop the inner guard
   * around `console.error`) and this goes red.
   */
  it('does not throw when even the last-resort report throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('console is gone')
    })
    const service = new ProviderDebugService({
      broadcast: () => {
        throw new Error('renderer went away')
      },
    })

    expect(() => service.record(makeEntry('s1', 1))).not.toThrow()
    consoleError.mockRestore()
  })
})
