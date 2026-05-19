import { describe, expect, it } from 'vitest'
import { validateBranchNameForPlatform } from './branch-name-validation.pure'

describe('validateBranchNameForPlatform', () => {
  it('accepts Windows-reserved names on non-Windows platforms', () => {
    expect(validateBranchNameForPlatform('CON', 'darwin')).toEqual({
      valid: true,
    })
  })

  it('rejects Windows reserved base names and extensions', () => {
    expect(validateBranchNameForPlatform('CON', 'win32').valid).toBe(false)
    expect(
      validateBranchNameForPlatform('feature/nul.txt', 'win32').valid,
    ).toBe(false)
    expect(validateBranchNameForPlatform('com1.work', 'win32').valid).toBe(
      false,
    )
  })

  it('allows names that only contain reserved substrings', () => {
    expect(validateBranchNameForPlatform('reconnect', 'win32').valid).toBe(true)
    expect(validateBranchNameForPlatform('lpthub', 'win32').valid).toBe(true)
  })

  it('rejects path segments ending in a dot or space', () => {
    expect(validateBranchNameForPlatform('feature.', 'win32').valid).toBe(false)
    expect(validateBranchNameForPlatform('feature/fix ', 'win32').valid).toBe(
      false,
    )
  })

  it('accepts normal branch names on Windows', () => {
    expect(
      validateBranchNameForPlatform('feature/add-windows-support', 'win32'),
    ).toEqual({ valid: true })
  })
})
