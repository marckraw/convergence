import { describe, expect, it } from 'vitest'
import {
  describeProviderAccountStatus,
  summariseProviderAccountHealth,
} from './provider-account.pure'
import type {
  ProviderAccount,
  ProviderAccountAttestationResult,
  ProviderAccountHealth,
} from './provider-account.types'

function account(overrides: Partial<ProviderAccount> = {}): ProviderAccount {
  return {
    id: 'acct-a',
    providerId: 'claude-code',
    label: 'Personal Max',
    authKind: 'subscription-oauth',
    email: 'a@example.com',
    orgId: 'org-a',
    plan: 'max',
    configDir: '/config',
    credentialDir: '/credentials',
    executionHostId: 'local',
    isDefault: false,
    status: 'connected',
    lastValidatedAt: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  }
}

function result(
  overrides: Partial<ProviderAccountAttestationResult> = {},
): ProviderAccountAttestationResult {
  return {
    accountId: 'acct-a',
    label: 'Personal Max',
    email: 'a@example.com',
    outcome: 'verified',
    status: 'connected',
    detail: null,
    unknownEntries: [],
    missingLinks: [],
    ...overrides,
  }
}

function health(
  overrides: Partial<ProviderAccountHealth> = {},
): ProviderAccountHealth {
  return {
    checkedAt: '2026-08-03T01:00:00.000Z',
    claudeVersion: '2.1.220',
    accounts: [],
    settingsWarnings: [],
    ...overrides,
  }
}

describe('describeProviderAccountStatus', () => {
  it('names each state in words the user can act on', () => {
    expect(describeProviderAccountStatus('connected')).toEqual({
      label: 'Connected',
      tone: 'ok',
    })
    expect(describeProviderAccountStatus('expired')).toEqual({
      label: 'Needs login',
      tone: 'warning',
    })
    expect(describeProviderAccountStatus('unavailable')).toEqual({
      label: 'Disabled',
      tone: 'danger',
    })
  })
})

describe('summariseProviderAccountHealth', () => {
  it('reports nothing before the first attestation', () => {
    expect(summariseProviderAccountHealth(null, [account()])).toEqual({
      mismatched: [],
      unknownEntries: [],
      hasSettingsOverride: false,
    })
  })

  it('surfaces accounts disabled for serving the wrong identity', () => {
    const summary = summariseProviderAccountHealth(
      health({ accounts: [result({ outcome: 'identity-mismatch' })] }),
      [account()],
    )

    expect(summary.mismatched.map((entry) => entry.accountId)).toEqual([
      'acct-a',
    ])
  })

  it('ignores a verdict about an account that no longer exists', () => {
    const summary = summariseProviderAccountHealth(
      health({
        accounts: [
          result({ accountId: 'removed', outcome: 'identity-mismatch' }),
        ],
      }),
      [account()],
    )

    expect(summary.mismatched).toEqual([])
  })

  it('collects unknown directory entries once, in a stable order', () => {
    const summary = summariseProviderAccountHealth(
      health({
        accounts: [
          result({ unknownEntries: ['sessions', 'credentials-v2'] }),
          result({ accountId: 'acct-b', unknownEntries: ['sessions'] }),
        ],
      }),
      [account(), account({ id: 'acct-b' })],
    )

    expect(summary.unknownEntries).toEqual(['credentials-v2', 'sessions'])
  })

  it('flags shared settings that make account selection decorative', () => {
    const summary = summariseProviderAccountHealth(
      health({
        settingsWarnings: [
          { kind: 'api-key-helper', key: 'apiKeyHelper', message: 'x' },
        ],
      }),
      [account()],
    )

    expect(summary.hasSettingsOverride).toBe(true)
  })
})
