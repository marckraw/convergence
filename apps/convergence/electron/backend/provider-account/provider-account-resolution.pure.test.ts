import { describe, expect, it, vi } from 'vitest'
import {
  assertLocalAccountSelection,
  resolveAccountForTurn,
  selectTurnAccountSnapshot,
} from './provider-account-resolution.pure'
import type { ProviderAccount } from './provider-account.types'

function account(overrides: Partial<ProviderAccount> = {}): ProviderAccount {
  return {
    id: 'acct-a',
    providerId: 'claude-code',
    label: 'Personal Max',
    authKind: 'subscription-oauth',
    email: 'a@example.com',
    orgId: 'org-a',
    plan: 'max',
    configDir: '/home/.convergence/provider-accounts/claude/acct-a',
    credentialDir: '/home/.convergence/provider-credentials/claude/acct-a',
    executionHostId: 'local',
    isDefault: false,
    status: 'connected',
    lastValidatedAt: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  }
}

describe('resolveAccountForTurn', () => {
  it('resolves nothing when no account was selected', () => {
    // The behaviour-neutral path: no selection means the turn runs exactly as
    // it always has, on the ambient default credential.
    expect(resolveAccountForTurn({ accountId: null, account: null })).toBeNull()
    expect(
      resolveAccountForTurn({ accountId: undefined, account: null }),
    ).toBeNull()
    expect(resolveAccountForTurn({ accountId: '', account: null })).toBeNull()
  })

  it('resolves the directories that decide which credential serves the turn', () => {
    expect(
      resolveAccountForTurn({ accountId: 'acct-a', account: account() }),
    ).toEqual({
      configDir: '/home/.convergence/provider-accounts/claude/acct-a',
      credentialDir: '/home/.convergence/provider-credentials/claude/acct-a',
    })
  })

  it('refuses rather than fall back when the account is gone', () => {
    expect(() =>
      resolveAccountForTurn({ accountId: 'acct-a', account: null }),
    ).toThrow(/no longer exists/)
  })

  it('stops routing turns to an account attestation disabled', () => {
    // PA7 arriving: the account served somebody else, so it must not be spent.
    expect(() =>
      resolveAccountForTurn({
        accountId: 'acct-a',
        account: account({ status: 'unavailable' }),
      }),
    ).toThrow(/is unavailable and cannot serve turns/)
  })

  it('stops routing turns to an account whose login expired', () => {
    expect(() =>
      resolveAccountForTurn({
        accountId: 'acct-a',
        account: account({ status: 'expired' }),
      }),
    ).toThrow(/is expired and cannot serve turns/)
  })

  it('names the account by identity so the message is actionable', () => {
    expect(() =>
      resolveAccountForTurn({
        accountId: 'acct-a',
        account: account({ status: 'unavailable' }),
      }),
    ).toThrow(/a@example\.com/)
  })
})

describe('selectTurnAccountSnapshot', () => {
  it('resolves fresh when a new logical turn begins', () => {
    const resolveFresh = vi.fn(() => 'account-b')

    expect(
      selectTurnAccountSnapshot({
        continuesCurrentTurn: false,
        currentSnapshot: 'account-a',
        resolveFresh,
      }),
    ).toBe('account-b')
    expect(resolveFresh).toHaveBeenCalledTimes(1)
  })

  it('holds the snapshot for a continuation of the same turn', () => {
    // A deferred-tool answer or a recovery restart belongs to the turn that
    // started it. Re-resolving would let a mid-turn selection leak into a
    // process the user believes is still running on the previous account.
    const resolveFresh = vi.fn(() => 'account-b')

    expect(
      selectTurnAccountSnapshot({
        continuesCurrentTurn: true,
        currentSnapshot: 'account-a',
        resolveFresh,
      }),
    ).toBe('account-a')
    expect(resolveFresh).not.toHaveBeenCalled()
  })

  it('resolves fresh when a continuation has no snapshot to hold', () => {
    const resolveFresh = vi.fn(() => 'account-b')

    expect(
      selectTurnAccountSnapshot({
        continuesCurrentTurn: true,
        currentSnapshot: null,
        resolveFresh,
      }),
    ).toBe('account-b')
  })
})

describe('assertLocalAccountSelection', () => {
  it('refuses a remote turn that names a local account', () => {
    // The lying case PA10 exists to prevent: the remote host runs on its own
    // credential whatever is selected here, and PA4 would still record the
    // local account id against the turn.
    expect(() =>
      assertLocalAccountSelection({
        executionHost: 'remote',
        accountId: 'acct-a',
      }),
    ).toThrow(/local-only for now/)
  })

  it('allows a remote turn on the ambient default, which is honest', () => {
    expect(() =>
      assertLocalAccountSelection({ executionHost: 'remote', accountId: null }),
    ).not.toThrow()
    expect(() =>
      assertLocalAccountSelection({
        executionHost: 'remote',
        accountId: undefined,
      }),
    ).not.toThrow()
  })

  it('leaves local sessions entirely alone', () => {
    expect(() =>
      assertLocalAccountSelection({
        executionHost: 'local',
        accountId: 'acct-a',
      }),
    ).not.toThrow()
  })
})
