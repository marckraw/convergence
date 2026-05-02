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
