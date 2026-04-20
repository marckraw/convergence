import { describe, expect, it } from 'vitest'
import {
  buildCodexThreadRecoveryEntry,
  buildTurnFailureEntry,
  isCodexThreadNotFoundError,
} from './codex-errors.pure'

describe('buildTurnFailureEntry', () => {
  const timestamp = '2026-04-17T10:00:00.000Z'

  it('formats an Error instance using its message', () => {
    const entry = buildTurnFailureEntry(new Error('rpc dropped'), timestamp)
    expect(entry).toEqual({
      type: 'system',
      text: 'Turn failed: rpc dropped',
      timestamp,
    })
  })

  it('stringifies non-Error rejections', () => {
    const entry = buildTurnFailureEntry('boom', timestamp)
    expect(entry).toEqual({
      type: 'system',
      text: 'Turn failed: boom',
      timestamp,
    })
  })

  it('falls back to String() for unknown objects', () => {
    const entry = buildTurnFailureEntry({ code: 42 }, timestamp)
    expect(entry.type).toBe('system')
    expect(entry.text.startsWith('Turn failed: ')).toBe(true)
    expect(entry.timestamp).toBe(timestamp)
  })

  it('handles undefined rejection value', () => {
    const entry = buildTurnFailureEntry(undefined, timestamp)
    expect(entry).toEqual({
      type: 'system',
      text: 'Turn failed: undefined',
      timestamp,
    })
  })
})

describe('isCodexThreadNotFoundError', () => {
  it('matches thread-not-found Error instances', () => {
    expect(
      isCodexThreadNotFoundError(
        new Error('thread not found: 019daad2-12e0-7c30-8699-5d09467a2f9d'),
      ),
    ).toBe(true)
  })

  it('matches string rejections case-insensitively', () => {
    expect(
      isCodexThreadNotFoundError('Thread Not Found: stale-thread-id'),
    ).toBe(true)
  })

  it('ignores unrelated failures', () => {
    expect(isCodexThreadNotFoundError(new Error('model not available'))).toBe(
      false,
    )
  })
})

describe('buildCodexThreadRecoveryEntry', () => {
  it('explains that recovery used a fresh thread', () => {
    const timestamp = '2026-04-17T10:00:00.000Z'
    expect(buildCodexThreadRecoveryEntry(timestamp)).toEqual({
      type: 'system',
      text: 'Codex thread was no longer available. Started a new thread; previous provider context may be missing.',
      timestamp,
    })
  })
})
