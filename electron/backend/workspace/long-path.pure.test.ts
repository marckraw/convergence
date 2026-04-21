import { describe, expect, it } from 'vitest'
import { checkWorktreePathLength, WINDOWS_MAX_PATH } from './long-path.pure'

describe('checkWorktreePathLength', () => {
  it('returns no-limit on non-Windows platforms', () => {
    const result = checkWorktreePathLength('a'.repeat(400), 'darwin')
    expect(result.exceedsLimit).toBe(false)
    expect(result.limit).toBeNull()
    expect(result.message).toBeNull()
  })

  it('returns below-limit on Windows for short paths', () => {
    const result = checkWorktreePathLength('C:\\projects\\foo', 'win32')
    expect(result.exceedsLimit).toBe(false)
    expect(result.limit).toBe(WINDOWS_MAX_PATH)
    expect(result.message).toBeNull()
  })

  it('flags Windows paths over 260 chars', () => {
    const path = 'C:\\' + 'a'.repeat(WINDOWS_MAX_PATH)
    const result = checkWorktreePathLength(path, 'win32')
    expect(result.exceedsLimit).toBe(true)
    expect(result.length).toBe(path.length)
    expect(result.message).toContain('260')
  })

  it('does not flag exactly 260 chars', () => {
    const path = 'a'.repeat(WINDOWS_MAX_PATH)
    const result = checkWorktreePathLength(path, 'win32')
    expect(result.exceedsLimit).toBe(false)
  })
})
