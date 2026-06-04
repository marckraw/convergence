import { describe, expect, it } from 'vitest'
import type { CursorCredentialStatus } from '@/entities/app-settings'
import { formatProviderCredentialStatus } from './provider-credentials.pure'

function cursorStatus(
  overrides: Partial<CursorCredentialStatus>,
): CursorCredentialStatus {
  return {
    providerId: 'cursor',
    configured: false,
    source: null,
    storage: null,
    account: null,
    service: null,
    email: null,
    emailSource: null,
    error: null,
    ...overrides,
  }
}

describe('formatProviderCredentialStatus', () => {
  it('formats loading and missing credentials', () => {
    expect(formatProviderCredentialStatus(null)).toBe('Checking...')
    expect(formatProviderCredentialStatus(cursorStatus({}))).toBe(
      'Not configured',
    )
  })

  it('prefers explicit credential errors', () => {
    expect(
      formatProviderCredentialStatus(
        cursorStatus({ error: 'Keychain unavailable.' }),
      ),
    ).toBe('Keychain unavailable.')
  })

  it('formats configured credential sources', () => {
    expect(
      formatProviderCredentialStatus(
        cursorStatus({ configured: true, source: 'environment' }),
      ),
    ).toBe('Configured from environment')
    expect(
      formatProviderCredentialStatus(
        cursorStatus({ configured: true, source: 'keychain' }),
      ),
    ).toBe('Configured in Keychain, key hidden')
    expect(
      formatProviderCredentialStatus(cursorStatus({ configured: true })),
    ).toBe('Configured')
  })
})
