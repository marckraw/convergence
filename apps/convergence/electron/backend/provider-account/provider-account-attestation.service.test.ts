import { ClaudeAccountMaintenance } from '../provider/claude-code/claude-account-maintenance.service'
import type { ProviderAccountAttestationDeps } from './provider-account-attestation.service'
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
    credentialHealth?: ProviderAccountAttestationDeps['credentialHealth']
    claudeMaintenance?: ClaudeAccountMaintenance
    historyWarnings?: string[]
    claudeHistory?: import('./provider-account-manifest.pure').ClaudeAccountLayout
  }) {
    return new ProviderAccountAttestationService({
      repository,
      credentialHealth: options.credentialHealth,
      claudeMaintenance: options.claudeMaintenance,
      codexHistory: {
        inspect: async () => ({
          ready: !options.historyWarnings?.length,
          warnings: options.historyWarnings ?? [],
        }),
      },
      ...(options.claudeHistory
        ? { claudeHistory: { inspect: async () => options.claudeHistory! } }
        : {}),
      fs: fakeFs(options.files ?? {}, options.dirs ?? {}),
      homeDir: HOME,
      now: () => clock,
      intervalMs: options.intervalMs ?? 24 * 60 * 60 * 1000,
      claudeVersion: () => options.version ?? '2.1.220',
    })
  }

  it.each(['expired', 'unavailable'] as const)(
    'never revives an %s row from matching cached identity, even with a local credential',
    async (status) => {
      repository.setStatus('acct-a', status, null)
      const subject = service({
        files: {
          [`${CONFIG_DIR}/.claude.json`]: identityJson(
            'a@example.com',
            'org-a',
          ),
        },
        credentialHealth: { inspect: async () => 'present' },
      })
      const report = await subject.attestAll()
      expect(report.accounts[0]).toMatchObject({
        identityOutcome: 'verified',
        credentialHealth: 'present',
        status,
      })
      expect(repository.get('acct-a')?.status).toBe(status)
    },
  )

  it('records a missing local credential without turning command uncertainty into a logout', async () => {
    const inspect = vi
      .fn()
      .mockResolvedValueOnce('unknown')
      .mockResolvedValueOnce('absent')
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
      credentialHealth: { inspect },
    })
    await subject.attestAll()
    expect(repository.get('acct-a')?.status).toBe('connected')
    await subject.attestAll()
    expect(repository.get('acct-a')?.status).toBe('expired')
  })

  it('does not inspect an account during maintenance or overwrite the refused-login quarantine', async () => {
    const gate = new ClaudeAccountMaintenance()
    const inspect = vi.fn(async () => 'present' as const)
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
      claudeMaintenance: gate,
      credentialHealth: { inspect },
    })
    await gate.run('acct-a', async () => {
      repository.setStatus('acct-a', 'unavailable', null)
      const report = await subject.attestAll()
      expect(report.accounts[0].credentialHealth).toBe('unknown')
      expect(inspect).not.toHaveBeenCalled()
      expect(repository.get('acct-a')?.status).toBe('unavailable')
    })
  })

  it('holds a health lease until the status command exits, preventing reconnect races', async () => {
    const gate = new ClaudeAccountMaintenance()
    let finish!: () => void
    const inspect = vi.fn(
      () =>
        new Promise<'present'>((resolve) => {
          finish = () => resolve('present')
        }),
    )
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
      claudeMaintenance: gate,
      credentialHealth: { inspect },
    })
    const report = subject.attestAll()
    await vi.waitFor(() => expect(inspect).toHaveBeenCalled())
    await expect(gate.run('acct-a', async () => {})).rejects.toThrow(/active/)
    finish()
    await report
    await expect(gate.run('acct-a', async () => {})).resolves.toBeUndefined()
  })

  it('re-collects when a run is invalidated mid-flight, so the resolved report reflects the post-invalidation state', async () => {
    let finish!: () => void
    const inspect = vi
      .fn()
      .mockResolvedValueOnce('present')
      .mockImplementationOnce(
        () =>
          new Promise<'present'>((resolve) => {
            finish = () => resolve('present')
          }),
      )
      .mockResolvedValueOnce('present')
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
      credentialHealth: { inspect },
    })
    await subject.attestAll()
    const stale = subject.attestAll()
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledTimes(2))
    subject.invalidate('acct-a')
    expect(subject.getHealth().accounts).toEqual([])
    finish()
    const report = await stale
    // The invalidated collection is discarded, but the report does not stay
    // empty until the next hourly tick: the run re-collects once and resolves
    // with the post-invalidation state.
    expect(inspect).toHaveBeenCalledTimes(3)
    expect(report.accounts).toMatchObject([
      { accountId: 'acct-a', credentialHealth: 'present', status: 'connected' },
    ])
    expect(subject.getHealth().accounts.map((a) => a.accountId)).toEqual([
      'acct-a',
    ])
  })

  it('coalesces any number of invalidations during one run into a single re-collect', async () => {
    let finish!: () => void
    const inspect = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<'present'>((resolve) => {
            finish = () => resolve('present')
          }),
      )
      .mockResolvedValue('present' as const)
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
      credentialHealth: { inspect },
    })
    const run = subject.attestAll()
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledTimes(1))
    subject.invalidate('acct-a')
    subject.invalidate('acct-a')
    subject.invalidate('acct-a')
    finish()
    const report = await run
    // One probe per collect for this single account: exactly two collects —
    // the invalidated one plus one coalesced re-run, not one per invalidation.
    expect(inspect).toHaveBeenCalledTimes(2)
    expect(report.accounts).toMatchObject([{ accountId: 'acct-a' }])
  })

  it('caps consecutive re-collects at three, then keeps the freshest report and stamps it', async () => {
    // An invalidate storm: every collection is invalidated while it runs.
    const storm: { invalidate: (accountId: string) => void } = {
      invalidate: () => {},
    }
    const inspect = vi.fn(async () => {
      storm.invalidate('acct-a')
      return 'present' as const
    })
    const subject = service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
      credentialHealth: { inspect },
    })
    storm.invalidate = (accountId) => subject.invalidate(accountId)
    const report = await subject.attestAll()
    // One collect plus at most three re-runs, then the freshest is committed.
    expect(inspect).toHaveBeenCalledTimes(4)
    expect(report.accounts).toMatchObject([{ accountId: 'acct-a' }])
    expect(report.checkedAt).toBe(new Date(clock).toISOString())
    expect(subject.getHealth()).toBe(report)
    // The stamp means the storm is over for this report: the next due check
    // returns the committed report instead of collecting a fifth time.
    expect(await subject.attestIfDue()).toBe(report)
    expect(inspect).toHaveBeenCalledTimes(4)
  })

  it('wakes the existing due check hourly and stops its timer on shutdown', async () => {
    vi.useFakeTimers()
    try {
      const subject = service({})
      const check = vi
        .spyOn(subject, 'attestIfDue')
        .mockResolvedValue(subject.getHealth())
      const stop = subject.startMonitoring()
      expect(check).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(check).toHaveBeenCalledTimes(2)
      stop()
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(check).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports private history independently of matching account identity', async () => {
    const layout = {
      entries: [
        {
          name: 'projects',
          status: 'real-directory' as const,
          hasPrivateContent: true,
        },
      ],
      fullyShared: false,
      privateEntries: ['projects'],
      unreadableEntries: [],
    }
    const report = await service({
      files: {
        [`${CONFIG_DIR}/.claude.json`]: identityJson('a@example.com', 'org-a'),
      },
      claudeHistory: layout,
    }).attestAll()
    expect(report.accounts[0].outcome).toBe('verified')
    expect(report.accounts[0].claudeHistory).toEqual(layout)
  })

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

  it('stamps the committed report and lastVersion with the version at collection start', async () => {
    let version = '2.1.220'
    let clockNow = clock
    let finish!: () => void
    const inspect = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<'present'>((resolve) => {
            finish = () => resolve('present')
          }),
      )
      .mockResolvedValue('present' as const)
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
      now: () => clockNow,
      claudeVersion: () => version,
      credentialHealth: { inspect },
    })
    const run = subject.attestAll()
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledTimes(1))
    // The CLI version changes while the collection is still probing: the
    // committed report must describe the version it started under, not the
    // one that landed mid-run.
    version = '2.2.0'
    finish()
    const report = await run
    expect(report.claudeVersion).toBe('2.1.220')
    // lastVersion carries the same value: with the interval not elapsed, the
    // version difference alone makes the next check due.
    clockNow += 60_000
    const second = await subject.attestIfDue()
    expect(second).not.toBe(report)
    expect(second.claudeVersion).toBe('2.2.0')
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
      historyWarnings: ['History collision: reconnect after resolving it.'],
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
    // Codex layout warnings are separate from Claude's broad manifest drift.
    expect(codex?.unknownEntries).toEqual([])
    expect(codex?.missingLinks).toEqual([])
    expect(codex?.nativeHistoryWarnings).toEqual([
      'History collision: reconnect after resolving it.',
    ])
    expect(repository.get('acct-c')?.status).toBe('connected')
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
