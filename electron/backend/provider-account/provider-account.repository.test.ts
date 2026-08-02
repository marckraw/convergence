import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import {
  deriveProviderAccountConfigDir,
  deriveProviderAccountCredentialDir,
} from './provider-account.pure'
import { ProviderAccountRepository } from './provider-account.repository'
import type { CreateProviderAccountInput } from './provider-account.types'

const HOME = '/Users/tester'

function accountInput(
  id: string,
  overrides: Partial<CreateProviderAccountInput> = {},
): CreateProviderAccountInput {
  return {
    id,
    providerId: 'claude-code',
    label: `Account ${id}`,
    authKind: 'subscription-oauth',
    configDir: deriveProviderAccountConfigDir({
      homeDir: HOME,
      providerId: 'claude',
      accountId: id,
    }),
    credentialDir: deriveProviderAccountCredentialDir({
      homeDir: HOME,
      providerId: 'claude',
      accountId: id,
    }),
    executionHostId: 'local',
    ...overrides,
  }
}

describe('ProviderAccountRepository', () => {
  let repository: ProviderAccountRepository

  beforeEach(() => {
    repository = new ProviderAccountRepository(getDatabase())
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('returns null for an unknown account', () => {
    expect(repository.get('missing')).toBeNull()
  })

  it('round-trips an account', () => {
    const input = accountInput('acct-a', {
      email: 'a@example.com',
      orgId: 'org-a',
      plan: 'max',
      lastValidatedAt: '2026-08-02T20:00:00.000Z',
    })

    const created = repository.create(input)

    expect(created).toMatchObject({
      id: 'acct-a',
      providerId: 'claude-code',
      label: 'Account acct-a',
      authKind: 'subscription-oauth',
      email: 'a@example.com',
      orgId: 'org-a',
      plan: 'max',
      configDir: `${HOME}/.convergence/provider-accounts/claude/acct-a`,
      credentialDir: `${HOME}/.convergence/provider-credentials/claude/acct-a`,
      executionHostId: 'local',
      isDefault: false,
      status: 'connected',
      lastValidatedAt: '2026-08-02T20:00:00.000Z',
    })
    expect(repository.get('acct-a')).toEqual(created)
  })

  it('stores no secret material, only the paths that address the keychain', () => {
    repository.create(accountInput('acct-a'))

    const columns = (
      getDatabase()
        .prepare("PRAGMA table_info('provider_accounts')")
        .all() as Array<{ name: string }>
    ).map((column) => column.name)

    expect(columns).not.toContain('token')
    expect(columns).not.toContain('access_token')
    expect(columns).not.toContain('refresh_token')
    expect(columns).not.toContain('api_key')
    expect(columns).toContain('credential_dir')
  })

  it('rejects two accounts sharing a credential namespace', () => {
    repository.create(accountInput('acct-a'))

    expect(() =>
      repository.create(
        accountInput('acct-b', {
          credentialDir: `${HOME}/.convergence/provider-credentials/claude/acct-a`,
        }),
      ),
    ).toThrow(/UNIQUE/i)
  })

  it('rejects statuses outside the documented set', () => {
    expect(() =>
      repository.create(
        accountInput('acct-a', {
          status: 'sorta-connected' as never,
        }),
      ),
    ).toThrow(/CHECK/i)
  })

  it('lists accounts, optionally scoped to a provider', () => {
    repository.create(accountInput('acct-a'))
    repository.create(accountInput('acct-b'))
    repository.create(accountInput('acct-c', { providerId: 'codex' }))

    expect(repository.list().map((account) => account.id)).toEqual([
      'acct-a',
      'acct-b',
      'acct-c',
    ])
    expect(
      repository.listByProvider('claude-code').map((account) => account.id),
    ).toEqual(['acct-a', 'acct-b'])
  })

  it('overwrites the identity block whole so stale fields cannot survive', () => {
    repository.create(
      accountInput('acct-a', {
        email: 'old@example.com',
        orgId: 'org-old',
        plan: 'pro',
      }),
    )

    repository.saveIdentity('acct-a', {
      email: 'new@example.com',
      orgId: 'org-new',
      plan: null,
      status: 'connected',
      lastValidatedAt: '2026-08-02T21:00:00.000Z',
    })

    expect(repository.get('acct-a')).toMatchObject({
      email: 'new@example.com',
      orgId: 'org-new',
      plan: null,
      status: 'connected',
      lastValidatedAt: '2026-08-02T21:00:00.000Z',
    })
  })

  it('disables an account without touching its identity', () => {
    repository.create(accountInput('acct-a', { email: 'a@example.com' }))

    repository.setStatus('acct-a', 'unavailable', '2026-08-02T22:00:00.000Z')

    expect(repository.get('acct-a')).toMatchObject({
      email: 'a@example.com',
      status: 'unavailable',
      lastValidatedAt: '2026-08-02T22:00:00.000Z',
    })
  })

  it('renames the label and leaves both directory paths untouched', () => {
    const created = repository.create(accountInput('acct-a'))

    repository.rename('acct-a', 'Work Max')

    const renamed = repository.get('acct-a')
    expect(renamed?.label).toBe('Work Max')
    expect(renamed?.configDir).toBe(created.configDir)
    expect(renamed?.credentialDir).toBe(created.credentialDir)
  })

  it('keeps exactly one default per provider and execution host', () => {
    repository.create(accountInput('acct-a'))
    repository.create(accountInput('acct-b'))
    repository.create(accountInput('acct-c', { providerId: 'codex' }))

    repository.setDefault('acct-a')
    repository.setDefault('acct-c')
    expect(
      repository
        .list()
        .filter((account) => account.isDefault)
        .map((account) => account.id),
    ).toEqual(['acct-a', 'acct-c'])

    repository.setDefault('acct-b')
    expect(
      repository
        .list()
        .filter((account) => account.isDefault)
        .map((account) => account.id),
    ).toEqual(['acct-b', 'acct-c'])
  })

  it('ignores a default request for an unknown account', () => {
    repository.create(accountInput('acct-a'))
    repository.setDefault('acct-a')

    repository.setDefault('missing')

    expect(repository.get('acct-a')?.isDefault).toBe(true)
  })

  it('removes an account', () => {
    repository.create(accountInput('acct-a'))

    repository.remove('acct-a')

    expect(repository.get('acct-a')).toBeNull()
    expect(repository.list()).toEqual([])
  })
})
