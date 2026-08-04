import { describe, expect, it } from 'vitest'
import {
  AMBIENT_DEFAULT_ACCOUNT_ID,
  AMBIENT_DEFAULT_ACCOUNT_LABEL,
  buildProviderAccountPickerItems,
  describeProviderAccountIdentity,
  describeProviderAccountSelectionBlock,
  describeProviderAccountStatus,
  describeSelectedProviderAccount,
  isProviderAccountSelectable,
  isProviderAccountSelectionLocked,
  providerAccountIdFromPickerValue,
  resolveInitialProviderAccountSelection,
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

describe('describeProviderAccountIdentity', () => {
  it('leads with the email, because that is who the account is', () => {
    expect(
      describeProviderAccountIdentity(account({ email: 'work@example.com' })),
    ).toBe('work@example.com')
  })

  it('uses the label only when identity has not been captured yet', () => {
    expect(
      describeProviderAccountIdentity(
        account({ email: null, label: 'Second Max' }),
      ),
    ).toBe('Second Max')
  })
})

describe('isProviderAccountSelectable', () => {
  it('allows only a connected account to serve a turn', () => {
    // Mirrors resolveAccountForTurn, which refuses the others outright.
    expect(isProviderAccountSelectable(account())).toBe(true)
    expect(isProviderAccountSelectable(account({ status: 'expired' }))).toBe(
      false,
    )
    expect(
      isProviderAccountSelectable(account({ status: 'unavailable' })),
    ).toBe(false)
  })
})

describe('the composer account picker', () => {
  it('offers the ambient default as a first-class choice', () => {
    // Selecting nothing must stay possible: it is byte-for-byte today's
    // behaviour, and PA2/PA4 guarantee it.
    const items = buildProviderAccountPickerItems([])

    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(AMBIENT_DEFAULT_ACCOUNT_ID)
    expect(items[0].label).toBe(AMBIENT_DEFAULT_ACCOUNT_LABEL)
    expect(items[0].disabled).toBeFalsy()
  })

  it('presents each account as identity, never as a slot or a gauge', () => {
    const items = buildProviderAccountPickerItems([
      account({ email: 'work@example.com', orgId: 'ec48ac90' }),
    ])

    expect(items[1].label).toBe('work@example.com')
    expect(items[1].description).toBe('Organization ec48ac90')
  })

  it('falls back to the label when an account has no email yet', () => {
    const items = buildProviderAccountPickerItems([
      account({ email: null, label: 'Second Max' }),
    ])

    expect(items[1].label).toBe('Second Max')
  })

  it('marks the enrolled default without making it look different in kind', () => {
    const items = buildProviderAccountPickerItems([
      account({ isDefault: true }),
    ])

    expect(items[1].badge).toEqual({
      label: 'default',
      title: 'Preselected for new sessions',
    })
    expect(items[1].disabled).toBe(false)
  })

  it('shows a disabled account with its reason rather than hiding it', () => {
    // resolveAccountForTurn already refuses these, so offering one would
    // promise a turn the backend is going to reject.
    const items = buildProviderAccountPickerItems([
      account({ status: 'unavailable' }),
    ])

    expect(items[1].disabled).toBe(true)
    expect(items[1].badge?.label).toBe('Disabled')
    expect(items[1].badge?.title).toMatch(/Reconnect/)
  })

  it('shows an expired account as needing a login', () => {
    const items = buildProviderAccountPickerItems([
      account({ status: 'expired' }),
    ])

    expect(items[1].disabled).toBe(true)
    expect(items[1].badge?.label).toBe('Needs login')
  })

  it('never offers an auto-switch affordance', () => {
    // Manual selection is policy, not scope (ADR 0007). No entry may suggest
    // switching on the user's behalf.
    const items = buildProviderAccountPickerItems([
      account(),
      account({ id: 'acct-b', email: 'b@example.com' }),
    ])

    for (const item of items) {
      expect(`${item.label} ${item.description ?? ''}`).not.toMatch(
        /auto|automatic|when low|rotate/i,
      )
    }
  })
})

describe('describeSelectedProviderAccount', () => {
  it('names the ambient default when nothing is selected', () => {
    expect(describeSelectedProviderAccount(null, [])).toBe(
      AMBIENT_DEFAULT_ACCOUNT_LABEL,
    )
  })

  it('names the selected account by identity', () => {
    expect(
      describeSelectedProviderAccount('acct-a', [
        account({ email: 'work@example.com' }),
      ]),
    ).toBe('work@example.com')
  })

  it('falls back to the ambient default when the account vanished', () => {
    expect(describeSelectedProviderAccount('removed', [account()])).toBe(
      AMBIENT_DEFAULT_ACCOUNT_LABEL,
    )
  })
})

describe('providerAccountIdFromPickerValue', () => {
  it('turns the ambient sentinel back into no selection', () => {
    expect(
      providerAccountIdFromPickerValue(AMBIENT_DEFAULT_ACCOUNT_ID),
    ).toBeNull()
    expect(providerAccountIdFromPickerValue('acct-a')).toBe('acct-a')
  })
})

describe('isProviderAccountSelectionLocked', () => {
  it('is unlocked with no session, so a new session can pick freely', () => {
    expect(isProviderAccountSelectionLocked(null)).toBe(false)
  })

  it('locks while a turn is running', () => {
    expect(
      isProviderAccountSelectionLocked({
        status: 'running',
        attention: 'none',
      }),
    ).toBe(true)
  })

  it('stays locked while a deferred question is open', () => {
    // PA4 holds one account for the whole logical turn: the answer belongs to
    // the account that asked.
    expect(
      isProviderAccountSelectionLocked({
        status: 'completed',
        attention: 'needs-input',
      }),
    ).toBe(true)
    expect(
      isProviderAccountSelectionLocked({
        status: 'completed',
        attention: 'needs-approval',
      }),
    ).toBe(true)
  })

  it('unlocks once the turn has settled, so the swap applies to the next one', () => {
    expect(
      isProviderAccountSelectionLocked({
        status: 'completed',
        attention: 'none',
      }),
    ).toBe(false)
    expect(
      isProviderAccountSelectionLocked({ status: 'idle', attention: 'none' }),
    ).toBe(false)
  })
})

describe('resolveInitialProviderAccountSelection', () => {
  it('shows the account that actually served the session last turn', () => {
    // The honest answer to "which account is this conversation on" is PA4's
    // record, not anything the composer remembers across a restart.
    expect(
      resolveInitialProviderAccountSelection({
        accounts: [
          account(),
          account({ id: 'acct-b', email: 'b@example.com' }),
        ],
        lastTurnAccountId: 'acct-b',
        hasActiveSession: true,
      }),
    ).toBe('acct-b')
  })

  it('shows the ambient default for a session whose turns ran on it', () => {
    expect(
      resolveInitialProviderAccountSelection({
        accounts: [account()],
        lastTurnAccountId: null,
        hasActiveSession: true,
      }),
    ).toBeNull()
  })

  it('does not resurrect an account that was removed since the turn', () => {
    expect(
      resolveInitialProviderAccountSelection({
        accounts: [account()],
        lastTurnAccountId: 'removed',
        hasActiveSession: true,
      }),
    ).toBeNull()
  })

  it('preselects the enrolled default for a new session', () => {
    expect(
      resolveInitialProviderAccountSelection({
        accounts: [account({ id: 'acct-b', isDefault: true })],
        hasActiveSession: false,
      }),
    ).toBe('acct-b')
  })

  it('never preselects a default that cannot serve a turn', () => {
    expect(
      resolveInitialProviderAccountSelection({
        accounts: [account({ isDefault: true, status: 'unavailable' })],
        hasActiveSession: false,
      }),
    ).toBeNull()
  })

  it('resolves to the ambient default when nothing is enrolled', () => {
    expect(
      resolveInitialProviderAccountSelection({
        accounts: [],
        hasActiveSession: false,
      }),
    ).toBeNull()
  })
})

describe('describeProviderAccountSelectionBlock', () => {
  it('explains that a remote session cannot use a local account', () => {
    // Accounts live on this machine and the wire protocol carries no account
    // reference, so a remote host runs on its own credential regardless.
    expect(describeProviderAccountSelectionBlock('remote')).toMatch(
      /local-only for now/,
    )
  })

  it('blocks nothing for a local session', () => {
    expect(describeProviderAccountSelectionBlock('local')).toBeNull()
    expect(describeProviderAccountSelectionBlock(null)).toBeNull()
    expect(describeProviderAccountSelectionBlock(undefined)).toBeNull()
  })
})
