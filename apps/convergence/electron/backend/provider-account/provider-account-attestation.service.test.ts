import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import {
  ProviderAccountAttestationService,
  type ProviderAccountAttestationFs,
} from './provider-account-attestation.service'
import { ProviderAccountRepository } from './provider-account.repository'

const HOME = '/Users/tester'
const CONFIG_DIR = `${HOME}/.convergence/provider-accounts/claude/acct-a`
const CREDENTIAL_DIR = `${HOME}/.convergence/provider-credentials/claude/acct-a`

function identityJson(email: string, orgId: string, subscriptionType?: string) {
  return JSON.stringify({
    oauthAccount: {
      emailAddress: email,
      organizationUuid: orgId,
      ...(subscriptionType ? { subscriptionType } : {}),
    },
  })
}

function fakeFs(files: Record<string, string>, dirs: Record<string, string[]>) {
  const fs: ProviderAccountAttestationFs = {
    readFile: vi.fn(async (path: string) => {
      const contents = files[path]
      if (contents === undefined) throw new Error(`ENOENT: ${path}`)
      return contents
    }),
    readdir: vi.fn(async (path: string) => {
      const entries = dirs[path]
      if (!entries) throw new Error(`ENOENT: ${path}`)
      return entries
    }),
  }
  return fs
}

describe('ProviderAccountAttestationService', () => {
  let repository: ProviderAccountRepository
  let clock: number

  beforeEach(() => {
    repository = new ProviderAccountRepository(getDatabase())
    clock = 1_000_000
    repository.create({
      id: 'acct-a',
      providerId: 'claude-code',
      label: 'Personal Max',
      authKind: 'subscription-oauth',
      configDir: CONFIG_DIR,
      credentialDir: CREDENTIAL_DIR,
      executionHostId: 'local',
      email: 'a@example.com',
      orgId: 'org-a',
    })
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  function service(options: {
    files?: Record<string, string>
    dirs?: Record<string, string[]>
    version?: string | null
    intervalMs?: number
  }) {
    return new ProviderAccountAttestationService({
      repository,
      fs: fakeFs(options.files ?? {}, options.dirs ?? {}),
      homeDir: HOME,
      now: () => clock,
      intervalMs: options.intervalMs ?? 24 * 60 * 60 * 1000,
      claudeVersion: () => options.version ?? '2.1.220',
    })
  }

  it('keeps a matching account connected and records when it checked', async () => {
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
    })

    const report = await subject.attestAll()

    expect(report.accounts[0]).toMatchObject({
      accountId: 'acct-a',
      outcome: 'verified',
      status: 'connected',
    })
    expect(repository.get('acct-a')).toMatchObject({
      status: 'connected',
      lastValidatedAt: new Date(clock).toISOString(),
    })
  })

  it('refreshes the plan of a verified account, healing a wrong stored tier', async () => {
    // The first real enrolment stored `organizationRole` ("admin") as the plan.
    // Attestation already reads the config it would need to correct it, so the
    // wrong tier heals itself on the next check instead of needing a migration.
    repository.saveIdentity('acct-a', {
      email: 'a@example.com',
      orgId: 'org-a',
      plan: 'admin',
      status: 'connected',
      lastValidatedAt: null,
    })

    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson(
          'a@example.com',
          'org-a',
          'max',
        ),
      },
    })

    await subject.attestAll()

    expect(repository.get('acct-a')).toMatchObject({
      email: 'a@example.com',
      orgId: 'org-a',
      plan: 'max',
      status: 'connected',
    })
  })

  it('stops claiming a tier once the account directory records none', async () => {
    repository.saveIdentity('acct-a', {
      email: 'a@example.com',
      orgId: 'org-a',
      plan: 'admin',
      status: 'connected',
      lastValidatedAt: null,
    })

    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
    })

    await subject.attestAll()

    expect(repository.get('acct-a')?.plan).toBeNull()
  })

  it('leaves the stored identity alone when attestation could not read one', async () => {
    repository.saveIdentity('acct-a', {
      email: 'a@example.com',
      orgId: 'org-a',
      plan: 'max',
      status: 'connected',
      lastValidatedAt: null,
    })

    await service({}).attestAll()

    expect(repository.get('acct-a')).toMatchObject({
      email: 'a@example.com',
      plan: 'max',
      status: 'connected',
    })
  })

  it('disables an account that has started serving somebody else', async () => {
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('b@example.com', 'org-b'),
      },
    })

    const report = await subject.attestAll()

    expect(report.accounts[0].outcome).toBe('identity-mismatch')
    expect(repository.get('acct-a')?.status).toBe('unavailable')
  })

  it('does not disable an account just because a file could not be read', async () => {
    const subject = service({})

    const report = await subject.attestAll()

    expect(report.accounts[0].outcome).toBe('unreadable')
    expect(repository.get('acct-a')?.status).toBe('connected')
  })

  it('surfaces account-directory entries the manifest never planned for', async () => {
    // PA0 caught sessions/, session-env/ and backups/ by hand. This is the
    // automatic version: report, never silently partition.
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
      dirs: {
        [`${HOME}/.claude`]: ['skills', 'agents'],
        [CONFIG_DIR]: ['skills', 'agents', '.claude.json', 'credentials-v2'],
      },
    })

    const report = await subject.attestAll()

    expect(report.accounts[0].unknownEntries).toEqual(['credentials-v2'])
    expect(report.accounts[0].missingLinks).toEqual([])
  })

  it('surfaces a shared entry that never got linked in', async () => {
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
      dirs: {
        [`${HOME}/.claude`]: ['skills', 'agents'],
        [CONFIG_DIR]: ['skills'],
      },
    })

    const report = await subject.attestAll()

    expect(report.accounts[0].missingLinks).toEqual(['agents'])
  })

  it('re-scans shared settings, because they change after enrolment', async () => {
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
        [`${HOME}/.claude/settings.json`]: JSON.stringify({
          apiKeyHelper: '/usr/local/bin/key.sh',
        }),
      },
    })

    const report = await subject.attestAll()

    expect(report.settingsWarnings.map((warning) => warning.kind)).toEqual([
      'api-key-helper',
    ])
  })

  it('re-attests as soon as the Claude version changes', async () => {
    let version = '2.1.220'
    const subject = new ProviderAccountAttestationService({
      repository,
      fs: fakeFs(
        {
          [`${CONFIG_DIR}/.claude.json`]: identityJson(
            'a@example.com',
            'org-a',
          ),
        },
        {},
      ),
      homeDir: HOME,
      now: () => clock,
      claudeVersion: () => version,
    })

    await subject.attestIfDue()
    const firstCheckedAt = subject.getHealth().checkedAt

    clock += 60_000
    await subject.attestIfDue()
    expect(subject.getHealth().checkedAt).toBe(firstCheckedAt)

    version = '2.2.0'
    clock += 60_000
    await subject.attestIfDue()
    expect(subject.getHealth().checkedAt).not.toBe(firstCheckedAt)
    expect(subject.getHealth().claudeVersion).toBe('2.2.0')
  })

  it('re-attests once the interval has elapsed', async () => {
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
      intervalMs: 1_000,
    })

    await subject.attestIfDue()
    const firstCheckedAt = subject.getHealth().checkedAt

    clock += 999
    await subject.attestIfDue()
    expect(subject.getHealth().checkedAt).toBe(firstCheckedAt)

    clock += 1
    await subject.attestIfDue()
    expect(subject.getHealth().checkedAt).not.toBe(firstCheckedAt)
  })

  it('attests a Codex account against the file its own login writes', async () => {
    // Same net, different file. A Codex home reports its identity in
    // auth.json, and reading .claude.json there would find nothing and read as
    // "unconfirmed" forever.
    const CODEX_HOME = `${HOME}/.convergence/provider-accounts/codex/acct-c`
    repository.create({
      id: 'acct-c',
      providerId: 'codex',
      label: 'Codex Pro',
      authKind: 'subscription-oauth',
      configDir: CODEX_HOME,
      credentialDir: CODEX_HOME,
      executionHostId: 'local',
      email: 'someone@example.com',
      orgId: 'acc_123',
    })

    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
        [`${CODEX_HOME}/auth.json`]: JSON.stringify({
          tokens: {
            account_id: 'acc_123',
            id_token: { email: 'someone@example.com' },
          },
        }),
      },
    })

    const report = await subject.attestAll()
    const codex = report.accounts.find((entry) => entry.accountId === 'acct-c')

    expect(codex).toMatchObject({ outcome: 'verified', status: 'connected' })
    // A Codex home shares nothing by symlink, so drift cannot apply to it.
    expect(codex?.unknownEntries).toEqual([])
    expect(codex?.missingLinks).toEqual([])
  })

  it('disables a Codex account that has started serving somebody else', async () => {
    const CODEX_HOME = `${HOME}/.convergence/provider-accounts/codex/acct-c`
    repository.create({
      id: 'acct-c',
      providerId: 'codex',
      label: 'Codex Pro',
      authKind: 'subscription-oauth',
      configDir: CODEX_HOME,
      credentialDir: CODEX_HOME,
      executionHostId: 'local',
      email: 'someone@example.com',
      orgId: 'acc_123',
    })

    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
        [`${CODEX_HOME}/auth.json`]: JSON.stringify({
          tokens: {
            account_id: 'acc_999',
            id_token: { email: 'somebody-else@example.com' },
          },
        }),
      },
    })

    await subject.attestAll()

    expect(repository.get('acct-c')?.status).toBe('unavailable')
  })

  it('reports an empty health snapshot before the first check', () => {
    expect(service({}).getHealth()).toEqual({
      checkedAt: null,
      claudeVersion: null,
      accounts: [],
      settingsWarnings: [],
    })
  })
})
