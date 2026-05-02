import { describe, expect, it } from 'vitest'
import {
  appendEntry,
  emptyRingState,
  serializeEntry,
} from './provider-debug.pure'
import type { ProviderDebugEntry } from './provider-debug.types'

function makeEntry(seq: number): ProviderDebugEntry {
  return {
    sessionId: 'session-1',
    providerId: 'codex',
    at: seq,
    direction: 'in',
    channel: 'notification',
    method: `method-${seq}`,
  }
}

describe('provider-debug.pure', () => {
  describe('appendEntry', () => {
    it('appends to an empty ring without eviction', () => {
      const state = emptyRingState(5)
      const next = appendEntry(state, makeEntry(1))
      expect(next.entries).toHaveLength(1)
      expect(next.entries[0]?.method).toBe('method-1')
    })

    it('preserves capacity when full and drops oldest', () => {
      let state = emptyRingState(3)
      for (let i = 1; i <= 5; i++) {
        state = appendEntry(state, makeEntry(i))
      }
      expect(state.entries).toHaveLength(3)
      expect(state.entries.map((e) => e.method)).toEqual([
        'method-3',
        'method-4',
        'method-5',
      ])
    })

    it('does not mutate the input state', () => {
      const state = emptyRingState(2)
      const next = appendEntry(state, makeEntry(1))
      expect(state.entries).toHaveLength(0)
      expect(next).not.toBe(state)
    })
  })

  describe('serializeEntry', () => {
    it('serializes a normal entry as a single JSON line', () => {
      const line = serializeEntry(makeEntry(1))
      expect(line).not.toContain('\n')
      const parsed = JSON.parse(line)
      expect(parsed.method).toBe('method-1')
      expect(parsed.providerId).toBe('codex')
    })

    it('falls back to "<unserializable>" payload when JSON.stringify throws', () => {
      const cyclic: { self?: unknown } = {}
      cyclic.self = cyclic
      const entry: ProviderDebugEntry = {
        ...makeEntry(2),
        payload: cyclic,
      }
      const line = serializeEntry(entry)
      const parsed = JSON.parse(line)
      expect(parsed.payload).toBe('<unserializable>')
    })
  })
})
