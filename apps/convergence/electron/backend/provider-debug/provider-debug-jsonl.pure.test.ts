import { describe, expect, it } from 'vitest'
import {
  JSONL_RETAIN_AGE_MS,
  JSONL_RETAIN_ROTATIONS,
} from './provider-debug.pure'
import {
  nextRotationIndex,
  parseSessionLogFilename,
  selectCleanupTargets,
} from './provider-debug-jsonl.pure'

describe('parseSessionLogFilename', () => {
  it('parses an active session file', () => {
    expect(parseSessionLogFilename('abc.jsonl')).toEqual({
      sessionId: 'abc',
      rotationIndex: null,
    })
  })

  it('parses a rotated file', () => {
    expect(parseSessionLogFilename('abc.3.jsonl')).toEqual({
      sessionId: 'abc',
      rotationIndex: 3,
    })
  })

  it('returns null for non-matching files', () => {
    expect(parseSessionLogFilename('readme.md')).toBeNull()
    expect(parseSessionLogFilename('.DS_Store')).toBeNull()
  })
})

describe('nextRotationIndex', () => {
  it('returns 1 when no rotated files exist for the session', () => {
    expect(nextRotationIndex(['abc.jsonl'], 'abc')).toBe(1)
  })

  it('increments past the highest rotation index for the session', () => {
    expect(
      nextRotationIndex(['abc.1.jsonl', 'abc.2.jsonl', 'def.4.jsonl'], 'abc'),
    ).toBe(3)
  })
})

describe('selectCleanupTargets', () => {
  const NOW = 1_000_000_000

  it('drops files for sessions no longer known', () => {
    const result = selectCleanupTargets({
      candidates: [
        { filename: 'gone.jsonl', mtimeMs: NOW },
        { filename: 'gone.1.jsonl', mtimeMs: NOW },
        { filename: 'kept.jsonl', mtimeMs: NOW },
      ],
      knownSessionIds: new Set(['kept']),
      now: NOW,
    })
    expect(result.sort()).toEqual(['gone.1.jsonl', 'gone.jsonl'])
  })

  it('drops files older than the retention age regardless of session', () => {
    const result = selectCleanupTargets({
      candidates: [
        { filename: 's.jsonl', mtimeMs: NOW - JSONL_RETAIN_AGE_MS - 1 },
        { filename: 's.1.jsonl', mtimeMs: NOW },
      ],
      knownSessionIds: new Set(['s']),
      now: NOW,
    })
    expect(result).toEqual(['s.jsonl'])
  })

  it('keeps the newest N rotations and evicts older ones', () => {
    const candidates = Array.from(
      { length: JSONL_RETAIN_ROTATIONS + 3 },
      (_, i) => ({
        filename: `s.${i + 1}.jsonl`,
        mtimeMs: NOW - (JSONL_RETAIN_ROTATIONS + 3 - i) * 1000,
      }),
    )
    const result = selectCleanupTargets({
      candidates,
      knownSessionIds: new Set(['s']),
      now: NOW,
    })
    // The 3 oldest rotations should be evicted.
    expect(result).toEqual(['s.1.jsonl', 's.2.jsonl', 's.3.jsonl'])
  })
})
