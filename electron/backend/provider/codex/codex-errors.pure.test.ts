import { describe, expect, it } from 'vitest'
import { buildTurnFailureEntry } from './codex-errors.pure'

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
