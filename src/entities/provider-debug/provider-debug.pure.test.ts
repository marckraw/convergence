import { describe, expect, it } from 'vitest'
import { appendBoundedEntries } from './provider-debug.pure'
import type { ProviderDebugEntry } from './provider-debug.types'

function entry(seq: number): ProviderDebugEntry {
  return {
    sessionId: 's1',
    providerId: 'codex',
    at: seq,
    direction: 'in',
    channel: 'notification',
    method: `m-${seq}`,
  }
}

describe('appendBoundedEntries', () => {
  it('appends below capacity', () => {
    const next = appendBoundedEntries([], entry(1), 3)
    expect(next).toEqual([entry(1)])
  })

  it('drops oldest when at capacity', () => {
    let acc: ProviderDebugEntry[] = []
    for (let i = 1; i <= 5; i++) {
      acc = appendBoundedEntries(acc, entry(i), 3)
    }
    expect(acc.map((e) => e.method)).toEqual(['m-3', 'm-4', 'm-5'])
  })

  it('does not mutate the input array', () => {
    const input: ProviderDebugEntry[] = [entry(1)]
    const result = appendBoundedEntries(input, entry(2), 3)
    expect(input).toEqual([entry(1)])
    expect(result).not.toBe(input)
  })
})
