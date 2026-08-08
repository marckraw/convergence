import { describe, expect, it } from 'vitest'
import {
  buildCodexErrorNote,
  buildCodexProcessExitEntry,
  buildCodexThreadRecoveryEntry,
  buildTurnFailureEntry,
  classifyCodexErrorNotification,
  isCodexThreadNotFoundError,
  readCodexErrorNotificationMessage,
} from './codex-errors.pure'

describe('buildTurnFailureEntry', () => {
  const timestamp = '2026-04-17T10:00:00.000Z'

  it('formats an Error instance using its message', () => {
    const entry = buildTurnFailureEntry(new Error('rpc dropped'), timestamp)
    expect(entry).toEqual({
      text: 'Turn failed: rpc dropped',
      level: 'error',
      timestamp,
    })
  })

  it('stringifies non-Error rejections', () => {
    const entry = buildTurnFailureEntry('boom', timestamp)
    expect(entry).toEqual({
      text: 'Turn failed: boom',
      level: 'error',
      timestamp,
    })
  })

  it('falls back to String() for unknown objects', () => {
    const entry = buildTurnFailureEntry({ code: 42 }, timestamp)
    expect(entry.level).toBe('error')
    expect(entry.text.startsWith('Turn failed: ')).toBe(true)
    expect(entry.timestamp).toBe(timestamp)
  })

  it('handles undefined rejection value', () => {
    const entry = buildTurnFailureEntry(undefined, timestamp)
    expect(entry).toEqual({
      text: 'Turn failed: undefined',
      level: 'error',
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

describe('classifyCodexErrorNotification', () => {
  it('reads the Codex retry notice as transient', () => {
    expect(classifyCodexErrorNotification('Reconnecting... 2/5')).toBe(
      'transient',
    )
  })

  it('reads stream interruptions as transient', () => {
    expect(
      classifyCodexErrorNotification('stream disconnected before completion: '),
    ).toBe('transient')
    expect(
      classifyCodexErrorNotification('stream error: unexpected end of stream'),
    ).toBe('transient')
    expect(classifyCodexErrorNotification('Connection failed: timed out')).toBe(
      'transient',
    )
  })

  it('reads an exhausted retry loop as fatal even though it says "retry"', () => {
    expect(
      classifyCodexErrorNotification('exceeded retry limit, last status: 429'),
    ).toBe('fatal')
  })

  it('reads usage limits and lost credentials as fatal', () => {
    expect(
      classifyCodexErrorNotification(
        "You've hit your usage limit. Upgrade to Plus to continue using Codex",
      ),
    ).toBe('fatal')
    expect(
      classifyCodexErrorNotification(
        'Your access token could not be refreshed. Please sign in again.',
      ),
    ).toBe('fatal')
  })

  it('leaves unrecognised wording unknown rather than guessing', () => {
    expect(classifyCodexErrorNotification('something went sideways')).toBe(
      'unknown',
    )
  })
})

describe('readCodexErrorNotificationMessage', () => {
  it('prefers the nested error message', () => {
    expect(
      readCodexErrorNotificationMessage({
        error: { message: 'Reconnecting... 2/5' },
        message: 'ignored',
      }),
    ).toBe('Reconnecting... 2/5')
  })

  it('falls back to a flat message', () => {
    expect(readCodexErrorNotificationMessage({ message: 'boom' })).toBe('boom')
  })

  it('degrades to a placeholder for shapes it does not recognise', () => {
    expect(readCodexErrorNotificationMessage(null)).toBe('Unknown error')
    expect(readCodexErrorNotificationMessage({ error: 42 })).toBe(
      'Unknown error',
    )
  })
})

describe('buildCodexErrorNote', () => {
  const timestamp = '2026-08-09T10:00:00.000Z'

  it('says a retry is under way without alarming the session', () => {
    expect(
      buildCodexErrorNote('Reconnecting... 2/5', 'transient', timestamp),
    ).toEqual({
      text: 'Codex hit a temporary problem and is retrying: Reconnecting... 2/5',
      level: 'warning',
      timestamp,
    })
  })

  it('reports an unrecognised error without claiming a retry', () => {
    expect(buildCodexErrorNote('odd thing', 'unknown', timestamp)).toEqual({
      text: 'Codex reported an error: odd thing',
      level: 'warning',
      timestamp,
    })
  })

  it('keeps the plain error wording for fatal errors', () => {
    expect(buildCodexErrorNote('usage limit', 'fatal', timestamp)).toEqual({
      text: 'Error: usage limit',
      level: 'error',
      timestamp,
    })
  })
})

describe('buildCodexProcessExitEntry', () => {
  const timestamp = '2026-08-09T10:00:00.000Z'

  it('quotes what the process said on its way out', () => {
    expect(
      buildCodexProcessExitEntry({
        code: 1,
        stderrTail: 'thread panicked at core/src/client.rs:412\n',
        interruptedTurn: true,
        timestamp,
      }),
    ).toEqual({
      text: 'Process exited with code 1: thread panicked at core/src/client.rs:412',
      level: 'error',
      timestamp,
    })
  })

  it('still names the code when the process said nothing', () => {
    expect(
      buildCodexProcessExitEntry({
        code: 137,
        stderrTail: '   \n',
        interruptedTurn: false,
        timestamp,
      }),
    ).toEqual({
      text: 'Process exited with code 137',
      level: 'error',
      timestamp,
    })
  })

  it('refuses to let a clean exit mid-turn pass unremarked', () => {
    expect(
      buildCodexProcessExitEntry({
        code: 0,
        stderrTail: '',
        interruptedTurn: true,
        timestamp,
      }),
    ).toEqual({
      text: 'The Codex process ended before finishing the turn',
      level: 'error',
      timestamp,
    })
  })

  it('says nothing about a clean exit with nothing in flight', () => {
    expect(
      buildCodexProcessExitEntry({
        code: 0,
        stderrTail: '',
        interruptedTurn: false,
        timestamp,
      }),
    ).toBeNull()
    expect(
      buildCodexProcessExitEntry({
        code: null,
        stderrTail: '',
        interruptedTurn: false,
        timestamp,
      }),
    ).toBeNull()
  })
})

describe('buildCodexThreadRecoveryEntry', () => {
  it('explains that recovery used a fresh thread', () => {
    const timestamp = '2026-04-17T10:00:00.000Z'
    expect(buildCodexThreadRecoveryEntry(timestamp)).toEqual({
      text: 'Codex thread was no longer available. Started a new thread; previous provider context may be missing.',
      level: 'warning',
      timestamp,
    })
  })
})
