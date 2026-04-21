import { describe, expect, it } from 'vitest'
import { validateBranchNameForPlatform } from './branch-name-validation.pure'

describe('validateBranchNameForPlatform', () => {
  it('accepts everything on non-Windows platforms', () => {
    expect(validateBranchNameForPlatform('CON', 'darwin')).toEqual({
      valid: true,
    })
    expect(validateBranchNameForPlatform('feature.', 'linux')).toEqual({
      valid: true,
    })
  })

  it('rejects Windows reserved base names', () => {
    const result = validateBranchNameForPlatform('CON', 'win32')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain('reserved')
  })

  it('rejects reserved names regardless of extension', () => {
    expect(validateBranchNameForPlatform('nul.txt', 'win32').valid).toBe(false)
    expect(validateBranchNameForPlatform('com1.work', 'win32').valid).toBe(
      false,
    )
  })

  it('rejects reserved name in any path segment', () => {
    const result = validateBranchNameForPlatform('feature/aux/fix', 'win32')
    expect(result.valid).toBe(false)
  })

  it('accepts names that merely contain reserved substrings', () => {
    expect(validateBranchNameForPlatform('reconnect', 'win32').valid).toBe(true)
    expect(validateBranchNameForPlatform('lpthub', 'win32').valid).toBe(true)
  })

  it('rejects segments ending in "." on Windows', () => {
    const result = validateBranchNameForPlatform('feature.', 'win32')
    expect(result.valid).toBe(false)
  })

  it('rejects segments ending in a space on Windows', () => {
    const result = validateBranchNameForPlatform('feature/fix ', 'win32')
    expect(result.valid).toBe(false)
  })

  it('accepts a normal branch name on Windows', () => {
    expect(
      validateBranchNameForPlatform('feature/add-windows-support', 'win32')
        .valid,
    ).toBe(true)
  })
})
