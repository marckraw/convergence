import { describe, expect, it } from 'vitest'
import { checkWorktreePathLength, WINDOWS_MAX_PATH } from './long-path.pure'

describe('checkWorktreePathLength', () => {
  it('has no limit on non-Windows platforms', () => {
    const result = checkWorktreePathLength('a'.repeat(400), 'darwin')

    expect(result.exceedsLimit).toBe(false)
    expect(result.limit).toBeNull()
    expect(result.message).toBeNull()
  })

  it('keeps exactly 260 characters valid on Windows', () => {
    const result = checkWorktreePathLength(
      'a'.repeat(WINDOWS_MAX_PATH),
      'win32',
    )

    expect(result.exceedsLimit).toBe(false)
    expect(result.limit).toBe(WINDOWS_MAX_PATH)
  })

  it('flags Windows paths over 260 characters', () => {
    const path = 'C:\\' + 'a'.repeat(WINDOWS_MAX_PATH)
    const result = checkWorktreePathLength(path, 'win32')

    expect(result.exceedsLimit).toBe(true)
    expect(result.length).toBe(path.length)
    expect(result.message).toContain('260')
  })
})
