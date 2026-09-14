import { describe, expect, it } from 'vitest'
import {
  classifyClaudeCredentialHealth,
  resolveClaudeHealthStatus,
} from './provider-account-credential-health.pure'

describe('Claude local credential evidence', () => {
  it('distinguishes local presence, absence and uncertainty without exposing output', () => {
    expect(
      classifyClaudeCredentialHealth(
        0,
        JSON.stringify({
          loggedIn: true,
          authMethod: 'claude.ai',
          apiProvider: 'firstParty',
        }),
      ),
    ).toBe('present')
    expect(
      classifyClaudeCredentialHealth(
        1,
        JSON.stringify({
          loggedIn: false,
          authMethod: 'none',
          apiProvider: 'firstParty',
        }),
      ),
    ).toBe('absent')
    for (const value of [
      'not-json secret-fixture',
      '[]',
      '{}',
      JSON.stringify({
        loggedIn: true,
        authMethod: 'api_key',
        apiProvider: 'firstParty',
      }),
    ])
      expect(classifyClaudeCredentialHealth(0, value)).toBe('unknown')
    expect(
      classifyClaudeCredentialHealth(
        null,
        JSON.stringify({
          loggedIn: false,
          authMethod: 'none',
          apiProvider: 'firstParty',
        }),
      ),
    ).toBe('unknown')
  })
  it.each(['expired', 'unavailable'] as const)(
    'never revives %s using matching metadata or local presence',
    (status) => {
      expect(resolveClaudeHealthStatus(status, 'verified', 'present')).toBe(
        status,
      )
      expect(resolveClaudeHealthStatus(status, 'verified', 'unknown')).toBe(
        status,
      )
    },
  )
  it('only demotes with positive evidence and preserves an honest unknown', () => {
    expect(resolveClaudeHealthStatus('connected', 'verified', 'absent')).toBe(
      'expired',
    )
    expect(resolveClaudeHealthStatus('connected', 'verified', 'unknown')).toBe(
      'connected',
    )
    expect(
      resolveClaudeHealthStatus('connected', 'identity-mismatch', 'present'),
    ).toBe('unavailable')
  })
})
