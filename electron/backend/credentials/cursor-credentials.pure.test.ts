import { describe, expect, it } from 'vitest'
import {
  describeCursorAdminApiAuthFailure,
  describeCursorUserApiKeyMismatch,
  isCursorUserApiKey,
  validateCursorAdminApiKey,
} from './cursor-credentials.pure'

describe('cursor credential helpers', () => {
  it('detects Cursor user API keys regardless of surrounding whitespace or case', () => {
    expect(isCursorUserApiKey('crsr_123')).toBe(true)
    expect(isCursorUserApiKey('  CRSR_123  ')).toBe(true)
    expect(isCursorUserApiKey('key_123')).toBe(false)
  })

  it('rejects empty Cursor Admin API keys', () => {
    expect(validateCursorAdminApiKey('   ')).toBe(
      'Cursor Admin API key cannot be empty.',
    )
  })

  it('rejects Cursor user API keys with source guidance', () => {
    const message = validateCursorAdminApiKey('crsr_123')

    expect(message).toBe(describeCursorUserApiKeyMismatch())
    expect(message).toContain('Cloud Agent/API page')
    expect(message).toContain('Dashboard > Settings > Cursor Admin API Keys')
    expect(message).toContain('Personal Pro accounts')
    expect(message).toContain('key_')
  })

  it('accepts non-user-key values for server-side authentication', () => {
    expect(validateCursorAdminApiKey('key_123')).toBeNull()
  })

  it('explains auth failures without pointing users to the wrong key type', () => {
    expect(describeCursorAdminApiAuthFailure()).toContain(
      'Personal Pro accounts and User API Keys from the Cloud Agent/API page',
    )
  })
})
