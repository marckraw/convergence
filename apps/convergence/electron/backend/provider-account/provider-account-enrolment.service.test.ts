import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import {
  ProviderAccountEnrolmentService,
  type ProviderAccountEnrolmentDeps,
  type ProviderAccountCommandResult,
  type ProviderAccountFs,
} from './provider-account-enrolment.service'
import type { ProviderAccountCommand } from './provider-account-enrolment.pure'
import { ProviderAccountRepository } from './provider-account.repository'
import { CodexAccountHistoryService } from './provider-account-codex-history.service'
import { ClaudeAccountMaintenance } from '../provider/claude-code/claude-account-maintenance.service'
import { resolveAccountForTurn } from './provider-account-resolution.pure'

const HOME = '/Users/tester'
const ACCOUNT_ID = 'acct-a'
const CONFIG_DIR = `${HOME}/.convergence/provider-accounts/claude/${ACCOUNT_ID}`
const CREDENTIAL_DIR = `${HOME}/.convergence/provider-credentials/claude/${ACCOUNT_ID}`

/**
 * An in-memory filesystem. Nothing in this suite may reach the real
 * `~/.claude`, the real keychain, or a real `claude` binary — the first real
 * enrolment is a person clicking a button.
 */
function fakeFs(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed))
  const dirs = new Set<string>()
  const links = new Map<string, string>()
  const removed: string[] = []

  const entriesOf = (path: string): string[] => {
    const prefix = `${path}/`
    const names = new Set<string>()
    for (const key of [...files.keys(), ...links.keys(), ...dirs]) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      if (rest) names.add(rest.split('/')[0])
    }
    return [...names]
  }

  const missing = (path: string) =>
    Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
  const fs: ProviderAccountFs = {
    unlink: vi.fn(async (path) => {
      if (dirs.has(path) && !links.has(path))
        throw new Error('Cannot unlink a directory')
      files.delete(path)
      links.delete(path)
    }),
    lstat: vi.fn(async (path: string) => {
      const directory = dirs.has(path) || entriesOf(path).length > 0
      if (!links.has(path) && !files.has(path) && !directory)
        throw missing(path)
      return {
        isSymbolicLink: () => links.has(path),
        isFile: () => files.has(path),
        isDirectory: () => directory && !links.has(path),
        size: files.get(path)?.length ?? 0,
      }
    }),
    readlink: vi.fn(async (path: string) => {
      const target = links.get(path)
      if (target === undefined) throw missing(path)
      return target
    }),
    copyFileExclusive: vi.fn(async (source: string, destination: string) => {
      if (files.has(destination))
        throw Object.assign(new Error('exists'), { code: 'EEXIST' })
      const data = files.get(source)
      if (data === undefined) throw missing(source)
      files.set(destination, data)
    }),
    createEmptyFile: vi.fn(async (path: string) => {
      if (files.has(path))
        throw Object.assign(new Error('exists'), { code: 'EEXIST' })
      files.set(path, '')
    }),
    rename: vi.fn(async (source: string, destination: string) => {
      for (const map of [files, links]) {
        for (const [path, value] of [...map]) {
          if (path === source || path.startsWith(source + '/')) {
            map.set(destination + path.slice(source.length), value)
            map.delete(path)
          }
        }
      }
      for (const path of [...dirs]) {
        if (path === source || path.startsWith(source + '/')) {
          dirs.add(destination + path.slice(source.length))
          dirs.delete(path)
        }
      }
    }),
    mkdir: vi.fn(async (path: string) => {
      dirs.add(path)
    }),
    chmod: vi.fn(async () => {}),
    readdir: vi.fn(async (path: string) => {
      const names = entriesOf(path)
      if (!names.length && !dirs.has(path)) throw missing(path)
      return names
    }),
    symlink: vi.fn(async (target: string, path: string) => {
      if (links.has(path) || files.has(path))
        throw Object.assign(new Error(`EEXIST: ${path}`), { code: 'EEXIST' })
      links.set(path, target)
    }),
    readFile: vi.fn(async (path: string) => {
      const contents = files.get(path)
      if (contents === undefined) throw missing(path)
      return contents
    }),
    writeFile: vi.fn(
      async (path: string, contents: string, options?: { flag: 'wx' }) => {
        if (options?.flag === 'wx' && files.has(path))
          throw Object.assign(new Error('exists'), { code: 'EEXIST' })
        files.set(path, contents)
      },
    ),
    rm: vi.fn(async (path: string) => {
      removed.push(path)
      files.delete(path)
      links.delete(path)
      dirs.delete(path)
    }),
  }

  return { fs, files, links, dirs, removed }
}

function fakeRunner(
  result: Partial<ProviderAccountCommandResult> = {},
  onRun?: (command: ProviderAccountCommand) => void,
) {
  const calls: ProviderAccountCommand[] = []
  const run = vi.fn(async (command: ProviderAccountCommand) => {
    calls.push(command)
    onRun?.(command)
    return { code: 0, stdout: '', stderr: '', ...result }
  })
  return { run, calls }
}

/**
 * Stands in for what a real `claude auth login` does to the account directory:
 * it merges the authenticated identity into that directory's own
 * `.claude.json`. Enrolment must read identity from *this*, not from anything
 * Convergence seeded — which is what makes the flow honest.
 */
function loginWritesIdentity(
  files: Map<string, string>,
  identity: string = IDENTITY_JSON,
) {
  return (command: ProviderAccountCommand) => {
    if (command.args[1] !== 'login') return
    const configDir = command.env.CLAUDE_CONFIG_DIR
    if (!configDir) return
    const path = `${configDir}/.claude.json`
    const existing = files.get(path)
    files.set(
      path,
      JSON.stringify({
        ...(existing ? JSON.parse(existing) : {}),
        ...JSON.parse(identity),
      }),
    )
  }
}

const IDENTITY_JSON = JSON.stringify({
  oauthAccount: {
    emailAddress: 'someone@example.com',
    organizationUuid: 'ec48ac90',
    subscriptionType: 'max',
  },
})

describe('ProviderAccountEnrolmentService', () => {
  let repository: ProviderAccountRepository

  beforeEach(() => {
    repository = new ProviderAccountRepository(getDatabase())
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  function service(options: {
    fs: ProviderAccountFs
    run: ReturnType<typeof fakeRunner>['run']
    binaryPath?: string | null
    codexMaintenance?: ProviderAccountEnrolmentDeps['codexMaintenance']
    claudeMaintenance?: ProviderAccountEnrolmentDeps['claudeMaintenance']
  }) {
    return new ProviderAccountEnrolmentService({
      repository,
      fs: options.fs,
      runCommand: options.run,
      homeDir: HOME,
      baseEnv: { PATH: '/usr/local/bin', HOME },
      newAccountId: () => ACCOUNT_ID,
      binaryPaths: {
        'claude-code':
          options.binaryPath === undefined
            ? '/usr/local/bin/claude'
            : options.binaryPath,
        codex: options.binaryPath === undefined ? '/usr/local/bin/codex' : null,
      },
      claudeMaintenance:
        options.claudeMaintenance ??
        (() => {
          const gate = new ClaudeAccountMaintenance()
          return {
            run: <T>(account: { id: string }, work: () => Promise<T>) =>
              gate.run(account.id, work),
          }
        })(),
      codexMaintenance: options.codexMaintenance ?? {
        run: async (_account, work) => work(),
      },
    })
  }

  describe('enrol', () => {
    function enrolFixture(extraFiles: Record<string, string> = {}) {
      const { fs, links, files } = fakeFs({
        [`${HOME}/.claude/settings.json`]: JSON.stringify({ model: 'opus' }),
        [`${HOME}/.claude/skills/a/SKILL.md`]: '# skill',
        [`${HOME}/.claude/agents/x.md`]: 'agent',
        [`${HOME}/.claude/backups/old.json`]: '{}',
        [`${HOME}/.claude/projects/p/session.jsonl`]: '{}',
        [`${HOME}/.claude.json`]: JSON.stringify({
          mcpServers: { linear: { command: 'npx' } },
          projects: { '/repo': { hasTrustDialogAccepted: true } },
        }),
        ...extraFiles,
      })
      const runner = fakeRunner({}, loginWritesIdentity(files))
      return {
        fs,
        links,
        files,
        runner,
        subject: service({ fs, run: runner.run }),
      }
    }

    it('stores the identity the account directory reports about itself', async () => {
      const { subject } = enrolFixture()

      const result = await subject.enrol({ email: 'someone@example.com' })

      expect(result.account).toMatchObject({
        id: ACCOUNT_ID,
        providerId: 'claude-code',
        email: 'someone@example.com',
        orgId: 'ec48ac90',
        plan: 'max',
        configDir: CONFIG_DIR,
        credentialDir: CREDENTIAL_DIR,
        status: 'connected',
      })
      expect(repository.get(ACCOUNT_ID)).toMatchObject({
        email: 'someone@example.com',
      })
    })

    it('uses the registry id in rows and the path token in directories', async () => {
      const { subject } = enrolFixture()

      const { account } = await subject.enrol({ email: 'someone@example.com' })

      expect(account.providerId).toBe('claude-code')
      expect(account.configDir).toContain('/provider-accounts/claude/')
      expect(account.configDir).not.toContain('claude-code')
    })

    it('symlinks everything shared and leaves the private entries alone', async () => {
      const { subject, links } = enrolFixture()

      await subject.enrol({ email: 'someone@example.com' })

      expect(links.get(`${CONFIG_DIR}/skills`)).toBe(`${HOME}/.claude/skills`)
      expect(links.get(`${CONFIG_DIR}/agents`)).toBe(`${HOME}/.claude/agents`)
      expect(links.get(`${CONFIG_DIR}/projects`)).toBe(
        `${HOME}/.claude/projects`,
      )
      expect(links.get(`${CONFIG_DIR}/settings.json`)).toBe(
        `${HOME}/.claude/settings.json`,
      )
      expect(links.has(`${CONFIG_DIR}/backups`)).toBe(false)
      expect(links.has(`${CONFIG_DIR}/.claude.json`)).toBe(false)
    })

    it('links an entry no manifest has heard of', async () => {
      const { subject, links } = enrolFixture({
        [`${HOME}/.claude/brand-new-thing/data`]: 'x',
      })

      await subject.enrol({ email: 'someone@example.com' })

      expect(links.get(`${CONFIG_DIR}/brand-new-thing`)).toBe(
        `${HOME}/.claude/brand-new-thing`,
      )
    })

    it('seeds the shared server list without inventing project trust', async () => {
      const { subject, fs } = enrolFixture()

      await subject.enrol({ email: 'someone@example.com' })

      const seeded = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0] === `${CONFIG_DIR}/.claude.json`,
      )
      expect(seeded).toBeDefined()
      const config = JSON.parse(seeded?.[1] as string)
      expect(config.mcpServers).toEqual({ linear: { command: 'npx' } })
      expect(config.projects).toBeUndefined()
    })

    it('runs login with the account credential namespace', async () => {
      const { subject, runner } = enrolFixture()

      await subject.enrol({ email: 'someone@example.com' })

      expect(runner.calls).toHaveLength(1)
      expect(runner.calls[0].args).toEqual([
        'auth',
        'login',
        '--email',
        'someone@example.com',
      ])
      expect(runner.calls[0].env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
        CREDENTIAL_DIR,
      )
    })

    it('warns when shared settings make account selection decorative', async () => {
      const { fs, files } = fakeFs({
        [`${HOME}/.claude/settings.json`]: JSON.stringify({
          apiKeyHelper: '/usr/local/bin/key.sh',
        }),
      })
      const runner = fakeRunner({}, loginWritesIdentity(files))

      const result = await service({ fs, run: runner.run }).enrol({
        email: 'someone@example.com',
      })

      expect(result.warnings.map((warning) => warning.kind)).toEqual([
        'api-key-helper',
      ])
    })

    it('does not enrol an account whose identity never appeared', async () => {
      const { fs } = fakeFs({
        [`${HOME}/.claude/settings.json`]: '{}',
      })
      const runner = fakeRunner()

      await expect(
        service({ fs, run: runner.run }).enrol({
          email: 'someone@example.com',
        }),
      ).rejects.toThrow(/reported no identity/)
      expect(repository.list()).toEqual([])
    })

    it('does not enrol an account when login fails', async () => {
      const { fs, files } = fakeFs()
      const runner = fakeRunner(
        { code: 1, stderr: 'browser closed' },
        loginWritesIdentity(files),
      )

      await expect(
        service({ fs, run: runner.run }).enrol({
          email: 'someone@example.com',
        }),
      ).rejects.toThrow(/sign-in did not complete/)
      expect(repository.list()).toEqual([])
    })

    it('refuses to enrol when Claude Code is not on PATH', async () => {
      const { fs } = fakeFs()
      const runner = fakeRunner()

      await expect(
        service({ fs, run: runner.run, binaryPath: null }).enrol({
          email: 'someone@example.com',
        }),
      ).rejects.toThrow(/not available on PATH/)
      expect(runner.run).not.toHaveBeenCalled()
    })
  })

  describe('enrol (codex)', () => {
    const CODEX_HOME = `${HOME}/.convergence/provider-accounts/codex/${ACCOUNT_ID}`
    const CODEX_AUTH = JSON.stringify({
      tokens: {
        access_token: 'at',
        account_id: 'acc_123',
        id_token: {
          email: 'someone@example.com',
          chatgpt_account_id: 'acc_123',
          chatgpt_plan_type: 'pro',
        },
      },
    })

    /** What `codex login` does: it writes auth.json into CODEX_HOME. */
    function loginWritesAuth(files: Map<string, string>, auth = CODEX_AUTH) {
      return (command: ProviderAccountCommand) => {
        if (command.args[0] !== 'login') return
        const home = command.env.CODEX_HOME
        if (home) files.set(`${home}/auth.json`, auth)
      }
    }

    function codexFixture(auth?: string) {
      const { fs, files, removed } = fakeFs()
      const runner = fakeRunner({}, loginWritesAuth(files, auth))
      return {
        fs,
        files,
        removed,
        runner,
        subject: service({ fs, run: runner.run }),
      }
    }

    it('prepares shared conversation storage before login while keeping auth private', async () => {
      const { subject, runner, fs } = codexFixture()
      const result = await subject.enrol({ email: '', providerId: 'codex' })
      expect(result.warnings).toEqual([])
      expect(fs.symlink).toHaveBeenCalledWith(
        `${HOME}/.codex/sessions`,
        `${CODEX_HOME}/sessions`,
      )
      expect(fs.symlink).toHaveBeenCalledWith(
        `${HOME}/.codex/archived_sessions`,
        `${CODEX_HOME}/archived_sessions`,
      )
      expect(runner.calls[0].env.CODEX_HOME).toBe(CODEX_HOME)
    })

    it('refuses remote Codex enrollment before creating files or running login', async () => {
      const { subject, fs, runner } = codexFixture()
      await expect(
        subject.enrol({
          email: '',
          providerId: 'codex',
          executionHostId: 'remote-host',
        }),
      ).rejects.toThrow(/this machine only/)
      expect(fs.mkdir).not.toHaveBeenCalled()
      expect(runner.calls).toEqual([])
      expect(repository.list()).toEqual([])
    })

    it('never overwrites an existing Codex config during enrollment', async () => {
      const { subject, files, runner } = codexFixture()
      files.set(`${CODEX_HOME}/config.toml`, 'existing-config')
      await expect(
        subject.enrol({ email: '', providerId: 'codex' }),
      ).rejects.toThrow('exists')
      expect(files.get(`${CODEX_HOME}/config.toml`)).toBe('existing-config')
      expect(runner.calls).toEqual([])
    })

    it.each(['reconnect', 'remove'] as const)(
      'refuses %s before login, logout or identity writes when the account is busy',
      async (action) => {
        const { subject, runner, fs, removed } = codexFixture()
        await subject.enrol({
          email: 'someone@example.com',
          providerId: 'codex',
        })
        runner.calls.length = 0
        const guarded = service({
          fs,
          run: runner.run,
          codexMaintenance: {
            run: async () => {
              throw new Error('Account in use')
            },
          },
        })
        await expect(guarded[action](ACCOUNT_ID)).rejects.toThrow(
          'Account in use',
        )
        expect(runner.calls).toEqual([])
        expect(removed).toEqual([])
        expect(repository.get(ACCOUNT_ID)).toMatchObject({
          status: 'connected',
          orgId: 'acc_123',
        })
      },
    )

    it('reconnects through Codex login in the same home, never Claude login', async () => {
      const { subject, runner } = codexFixture()
      await subject.enrol({ email: 'someone@example.com', providerId: 'codex' })
      runner.calls.length = 0
      const account = await subject.reconnect(ACCOUNT_ID)
      expect(runner.calls).toHaveLength(1)
      expect(runner.calls[0].args).toEqual(['login'])
      expect(runner.calls[0].env.CODEX_HOME).toBe(CODEX_HOME)
      expect(runner.calls[0].env.CLAUDE_CONFIG_DIR).toBeUndefined()
      expect(account).toMatchObject({ orgId: 'acc_123', status: 'connected' })
    })

    it('reconnects an older account with private turns into shared history under maintenance', async () => {
      const rollout = 'sessions/2026/09/14/rollout-existing-thread.jsonl'
      const { fs, files, links } = fakeFs({
        [`${CODEX_HOME}/auth.json`]: CODEX_AUTH,
        [`${CODEX_HOME}/${rollout}`]: 'three existing turns',
        [`${CODEX_HOME}/thread-writer-locks/.coordination.lock`]: '',
      })
      repository.create({
        id: ACCOUNT_ID,
        providerId: 'codex',
        label: 'Older account',
        authKind: 'subscription-oauth',
        email: 'someone@example.com',
        orgId: 'acc_123',
        configDir: CODEX_HOME,
        credentialDir: CODEX_HOME,
        executionHostId: 'local',
      })
      const history = new CodexAccountHistoryService({ homeDir: HOME, fs })
      expect(await history.inspect(CODEX_HOME)).toEqual({
        ready: false,
        warnings: [
          'Conversations on this account are stored separately. Reconnect this account in Settings → Accounts → OpenAI to enable switching. Existing conversations will be preserved.',
        ],
      })
      let maintenanceOpen = false
      const rename = fs.rename
      fs.rename = vi.fn(async (source, destination) => {
        expect(maintenanceOpen).toBe(true)
        return rename(source, destination)
      })
      const runner = fakeRunner({}, loginWritesAuth(files))
      await service({
        fs,
        run: runner.run,
        codexMaintenance: {
          run: async (_account, work) => {
            maintenanceOpen = true
            try {
              return await work()
            } finally {
              maintenanceOpen = false
            }
          },
        },
      }).reconnect(ACCOUNT_ID)
      expect(await history.inspect(CODEX_HOME)).toEqual({
        ready: true,
        warnings: [],
      })
      expect(files.get(`${HOME}/.codex/${rollout}`)).toBe(
        'three existing turns',
      )
      expect(
        [...files].some(
          ([path, value]) =>
            path.includes('sessions.pre-share-') &&
            value === 'three existing turns',
        ),
      ).toBe(true)
      expect(links.has(`${CODEX_HOME}/auth.json`)).toBe(false)
      expect(files.get(`${CODEX_HOME}/auth.json`)).toBe(CODEX_AUTH)
    })

    it('disables a Codex account when reconnect selects a different workspace on the same email', async () => {
      const { subject, runner, files } = codexFixture()
      await subject.enrol({ email: 'someone@example.com', providerId: 'codex' })
      runner.run.mockImplementationOnce(async () => {
        files.set(
          `${CODEX_HOME}/auth.json`,
          CODEX_AUTH.replaceAll('acc_123', 'acc_other'),
        )
        return { code: 0, stdout: '', stderr: '' }
      })
      await expect(subject.reconnect(ACCOUNT_ID)).rejects.toThrow(
        /different ChatGPT account/,
      )
      expect(repository.get(ACCOUNT_ID)).toMatchObject({
        orgId: 'acc_123',
        status: 'unavailable',
      })
      expect(files.has(`${CODEX_HOME}/auth.json`)).toBe(false)
    })

    it('discards a reconnect credential without a verifiable account id', async () => {
      const { subject, runner, files } = codexFixture()
      await subject.enrol({ email: 'someone@example.com', providerId: 'codex' })
      runner.run.mockImplementationOnce(async () => {
        files.set(
          `${CODEX_HOME}/auth.json`,
          JSON.stringify({
            tokens: { id_token: { email: 'someone@example.com' } },
          }),
        )
        return { code: 0, stdout: '', stderr: '' }
      })
      await expect(subject.reconnect(ACCOUNT_ID)).rejects.toThrow(
        /no ChatGPT account ID/,
      )
      expect(files.has(`${CODEX_HOME}/auth.json`)).toBe(false)
      expect(repository.get(ACCOUNT_ID)?.status).toBe('unavailable')
    })

    it('can remove a legacy non-local row without a local server gate', async () => {
      const { fs, files, removed } = fakeFs()
      const runner = fakeRunner({}, loginWritesAuth(files))
      const maintenance = {
        run: vi.fn(async () => {
          throw new Error('No local server')
        }),
      }
      const subject = service({
        fs,
        run: runner.run,
        codexMaintenance: maintenance,
      })
      repository.create({
        id: ACCOUNT_ID,
        label: 'Legacy',
        authKind: 'subscription-oauth',
        configDir: CODEX_HOME,
        credentialDir: CODEX_HOME,
        email: 'someone@example.com',
        providerId: 'codex',
        executionHostId: 'little-monster',
      })
      await subject.remove(ACCOUNT_ID)
      expect(repository.get(ACCOUNT_ID)).toBeNull()
      expect(maintenance.run).not.toHaveBeenCalled()
      expect(removed).toContain(CODEX_HOME)
    })

    it.each([
      [
        'different workspace',
        CODEX_AUTH.replaceAll('acc_123', 'acc_other'),
        'different ChatGPT account',
      ],
      ['missing identity', '{}', 'no ChatGPT account ID'],
    ])(
      'keeps the %s refusal visible when credential removal fails',
      async (_case, auth, refusal) => {
        const { subject, runner, files, fs } = codexFixture()
        await subject.enrol({ email: '', providerId: 'codex' })
        runner.run.mockImplementationOnce(async () => {
          files.set(`${CODEX_HOME}/auth.json`, auth)
          return { code: 0, stdout: '', stderr: '' }
        })
        vi.mocked(fs.rm).mockRejectedValueOnce(
          new Error('EACCES: read-only home'),
        )
        const error = await subject
          .reconnect(ACCOUNT_ID)
          .catch((err: unknown) => err)
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain(refusal)
        expect((error as Error).message).toContain(
          'credential could NOT be removed: EACCES: read-only home',
        )
        expect((error as Error).message).not.toContain('was discarded')
        expect(files.has(`${CODEX_HOME}/auth.json`)).toBe(true)
        expect(repository.get(ACCOUNT_ID)).toMatchObject({
          orgId: 'acc_123',
          status: 'unavailable',
        })
      },
    )

    it('pins file credential storage before the first browser login', async () => {
      const { subject, files, runner } = codexFixture()
      const original = runner.run.getMockImplementation()!
      runner.run.mockImplementation(async (command) => {
        expect(files.get(`${CODEX_HOME}/config.toml`)).toContain(
          'cli_auth_credentials_store = "file"',
        )
        return original(command)
      })
      await subject.enrol({ email: '', providerId: 'codex' })
    })

    it.each([
      ['reconnect', false],
      ['remove', true],
    ] as const)(
      '%s requests the correct host retirement behavior',
      async (action, retire) => {
        const { subject: enrolling, runner, fs } = codexFixture()
        await enrolling.enrol({ email: '', providerId: 'codex' })
        const maintenanceCalls: Array<{ id: string; retire?: boolean }> = []
        const subject = service({
          fs,
          run: runner.run,
          codexMaintenance: {
            run: async (account, work, shouldRetire) => {
              maintenanceCalls.push({ id: account.id, retire: shouldRetire })
              return work()
            },
          },
        })
        await subject[action](ACCOUNT_ID)
        expect(maintenanceCalls).toEqual([{ id: ACCOUNT_ID, retire }])
      },
    )

    it('leaves a failed Codex reconnect unavailable without rewriting its historical identity', async () => {
      const { subject, runner } = codexFixture()
      await subject.enrol({ email: 'someone@example.com', providerId: 'codex' })
      runner.run.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'login cancelled',
      })
      await expect(subject.reconnect(ACCOUNT_ID)).rejects.toThrow(
        /login cancelled/,
      )
      expect(repository.get(ACCOUNT_ID)).toMatchObject({
        orgId: 'acc_123',
        status: 'unavailable',
      })
    })

    it('enrols a Codex account on the same model as a Claude one', async () => {
      const { subject } = codexFixture()

      const { account } = await subject.enrol({
        email: 'someone@example.com',
        providerId: 'codex',
      })

      expect(account).toMatchObject({
        id: ACCOUNT_ID,
        providerId: 'codex',
        email: 'someone@example.com',
        orgId: 'acc_123',
        plan: 'pro',
        configDir: CODEX_HOME,
        status: 'connected',
      })
    })

    it('runs codex login against the account own CODEX_HOME', async () => {
      const { subject, runner } = codexFixture()

      await subject.enrol({ email: 'someone@example.com', providerId: 'codex' })

      expect(runner.calls).toHaveLength(1)
      expect(runner.calls[0].command).toBe('/usr/local/bin/codex')
      expect(runner.calls[0].args).toEqual(['login'])
      expect(runner.calls[0].env.CODEX_HOME).toBe(CODEX_HOME)
    })

    it('records the credential where it actually is, not in a second directory', async () => {
      // Codex keeps auth.json inside the home. A separate credential directory
      // would describe a namespace that is not there.
      const { subject } = codexFixture()

      const { account } = await subject.enrol({
        email: 'someone@example.com',
        providerId: 'codex',
      })

      expect(account.credentialDir).toBe(account.configDir)
    })

    it('locks the plaintext credential down to its owner', async () => {
      const { subject, fs } = codexFixture()

      await subject.enrol({ email: 'someone@example.com', providerId: 'codex' })

      expect(fs.chmod).toHaveBeenCalledWith(`${CODEX_HOME}/auth.json`, 0o600)
      // MAR-2207: the home itself is owner-only, not just the credential file.
      expect(fs.chmod).toHaveBeenCalledWith(CODEX_HOME, 0o700)
    })

    it('does not enrol an account whose identity never appeared', async () => {
      const { fs } = fakeFs()
      const runner = fakeRunner()

      await expect(
        service({ fs, run: runner.run }).enrol({
          email: 'someone@example.com',
          providerId: 'codex',
        }),
      ).rejects.toThrow(/reported no identity/)
      expect(repository.list()).toEqual([])
    })

    it('does not enrol an account when the login fails', async () => {
      const { fs, files } = fakeFs()
      const runner = fakeRunner(
        { code: 1, stderr: 'browser closed' },
        loginWritesAuth(files),
      )

      await expect(
        service({ fs, run: runner.run }).enrol({
          email: 'someone@example.com',
          providerId: 'codex',
        }),
      ).rejects.toThrow(/browser closed/)
      expect(repository.list()).toEqual([])
    })

    it('signs out only the account home, never the shared one', async () => {
      const { subject, runner, removed } = codexFixture()
      await subject.enrol({ email: 'someone@example.com', providerId: 'codex' })
      runner.calls.length = 0

      await subject.remove(ACCOUNT_ID)

      expect(runner.calls).toHaveLength(1)
      expect(runner.calls[0].args).toEqual(['logout'])
      expect(runner.calls[0].env.CODEX_HOME).toBe(CODEX_HOME)
      expect(runner.calls[0].env.CODEX_HOME).not.toBe(`${HOME}/.codex`)
      expect(repository.get(ACCOUNT_ID)).toBeNull()
      expect(removed).toContain(CODEX_HOME)
    })

    it('refuses to enrol when Codex is not on PATH', async () => {
      const { fs } = fakeFs()
      const runner = fakeRunner()

      await expect(
        service({ fs, run: runner.run, binaryPath: null }).enrol({
          email: 'someone@example.com',
          providerId: 'codex',
        }),
      ).rejects.toThrow(/codex is not available on PATH/)
      expect(runner.run).not.toHaveBeenCalled()
    })
  })

  describe('reconnect', () => {
    it('disables admission during login and refuses a simultaneous reconnect without launching it', async () => {
      const { fs, files } = fakeFs()
      const runner = fakeRunner({}, loginWritesIdentity(files))
      const subject = service({ fs, run: runner.run })
      await subject.enrol({ email: 'someone@example.com' })
      let finish!: (result: ProviderAccountCommandResult) => void
      runner.run.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      const pending = subject.reconnect(ACCOUNT_ID)
      await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
      expect(repository.get(ACCOUNT_ID)?.status).toBe('unavailable')
      expect(() =>
        resolveAccountForTurn({
          accountId: ACCOUNT_ID,
          account: repository.get(ACCOUNT_ID),
        }),
      ).toThrow()
      await expect(subject.reconnect(ACCOUNT_ID)).rejects.toThrow(
        /being updated/,
      )
      await expect(subject.remove(ACCOUNT_ID)).rejects.toThrow(/being updated/)
      expect(runner.run).toHaveBeenCalledTimes(2)
      finish({ code: 0, stdout: '', stderr: '' })
      expect((await pending).status).toBe('connected')
    })

    it('keeps a failed credential discard visible, restores cached identity and never admits another turn', async () => {
      const { fs, files } = fakeFs()
      const runner = fakeRunner({}, loginWritesIdentity(files))
      const subject = service({ fs, run: runner.run })
      await subject.enrol({ email: 'someone@example.com' })
      const original = files.get(`${CONFIG_DIR}/.claude.json`)
      runner.run.mockImplementation(async (command) => {
        if (command.args[1] === 'login') {
          loginWritesIdentity(
            files,
            JSON.stringify({
              oauthAccount: {
                emailAddress: 'wrong@example.invalid',
                organizationUuid: 'wrong',
              },
            }),
          )(command)
          return { code: 0, stdout: '', stderr: '' }
        }
        return { code: 1, stdout: 'secret-fixture', stderr: 'secret-fixture' }
      })
      await expect(subject.reconnect(ACCOUNT_ID)).rejects.toThrow(
        /foreign credential could NOT be removed/,
      )
      expect(files.get(`${CONFIG_DIR}/.claude.json`)).toBe(original)
      expect(repository.get(ACCOUNT_ID)?.status).toBe('unavailable')
      expect(() =>
        resolveAccountForTurn({
          accountId: ACCOUNT_ID,
          account: repository.get(ACCOUNT_ID),
        }),
      ).toThrow()
    })

    it('does not start login when the existing config cannot be snapshotted', async () => {
      const { fs, files } = fakeFs()
      const runner = fakeRunner({}, loginWritesIdentity(files))
      const subject = service({ fs, run: runner.run })
      await subject.enrol({ email: 'someone@example.com' })
      vi.mocked(fs.readFile).mockRejectedValueOnce(
        Object.assign(new Error('private diagnostic'), { code: 'EACCES' }),
      )
      await expect(subject.reconnect(ACCOUNT_ID)).rejects.toThrow(
        /config could not be read/,
      )
      expect(runner.run).toHaveBeenCalledTimes(1)
      expect(repository.get(ACCOUNT_ID)?.status).toBe('connected')
    })
    async function enrolledThenBroken() {
      const { fs, files } = fakeFs()
      const runner = fakeRunner({}, loginWritesIdentity(files))
      const subject = service({ fs, run: runner.run })
      await subject.enrol({ email: 'someone@example.com' })
      repository.setStatus(ACCOUNT_ID, 'unavailable', null)
      runner.calls.length = 0
      return { subject, runner, files, fs }
    }

    it('logs in again against the same directories, never fresh ones', async () => {
      // Both paths are hashed into the keychain service name. A reconnect that
      // derived new ones would authorise a slot no spawn will ever look in.
      const { subject, runner } = await enrolledThenBroken()

      await subject.reconnect(ACCOUNT_ID)

      expect(runner.calls).toHaveLength(1)
      expect(runner.calls[0].args).toEqual([
        'auth',
        'login',
        '--email',
        'someone@example.com',
      ])
      expect(runner.calls[0].env.CLAUDE_CONFIG_DIR).toBe(CONFIG_DIR)
      expect(runner.calls[0].env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
        CREDENTIAL_DIR,
      )
    })

    it('brings a disabled account back once it proves the enrolled identity', async () => {
      const { subject } = await enrolledThenBroken()

      const account = await subject.reconnect(ACCOUNT_ID)

      expect(account.status).toBe('connected')
      expect(repository.get(ACCOUNT_ID)).toMatchObject({
        status: 'connected',
        email: 'someone@example.com',
        plan: 'max',
      })
    })

    it('refuses to reconnect as somebody else', async () => {
      // Signing into the wrong account in the browser is the easy mistake here,
      // and silently rebinding the row would make every past turn's attribution
      // a lie. Fail closed and leave the account disabled.
      const { fs, files } = fakeFs()
      const runner = fakeRunner({}, loginWritesIdentity(files))
      const subject = service({ fs, run: runner.run })
      await subject.enrol({ email: 'someone@example.com' })
      const originalConfig = files.get(`${CONFIG_DIR}/.claude.json`)
      runner.run.mockImplementation(async (command: ProviderAccountCommand) => {
        loginWritesIdentity(
          files,
          JSON.stringify({
            oauthAccount: {
              emailAddress: 'someone-else@example.com',
              organizationUuid: 'other-org',
            },
          }),
        )(command)
        return { code: 0, stdout: '', stderr: '' }
      })

      await expect(subject.reconnect(ACCOUNT_ID)).rejects.toThrow(
        /originally enrolled Claude account/,
      )
      expect(repository.get(ACCOUNT_ID)?.status).toBe('unavailable')
      expect(repository.get(ACCOUNT_ID)?.email).toBe('someone@example.com')
      expect(files.get(`${CONFIG_DIR}/.claude.json`)).toBe(originalConfig)
      expect(runner.run).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: ['auth', 'logout'] }),
      )
      expect(() =>
        resolveAccountForTurn({
          accountId: ACCOUNT_ID,
          account: repository.get(ACCOUNT_ID),
        }),
      ).toThrow()
    })

    it('leaves the account disabled when the login fails', async () => {
      const { fs, files } = fakeFs()
      const runner = fakeRunner({}, loginWritesIdentity(files))
      const subject = service({ fs, run: runner.run })
      await subject.enrol({ email: 'someone@example.com' })
      repository.setStatus(ACCOUNT_ID, 'expired', null)
      runner.run.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'browser closed',
      })

      await expect(subject.reconnect(ACCOUNT_ID)).rejects.toThrow(
        /sign-in did not complete/,
      )
      expect(repository.get(ACCOUNT_ID)?.status).toBe('unavailable')
    })

    it('refuses to reconnect an account that is not enrolled', async () => {
      const { fs } = fakeFs()
      const runner = fakeRunner()

      await expect(
        service({ fs, run: runner.run }).reconnect('missing'),
      ).rejects.toThrow(/not enrolled/)
      expect(runner.run).not.toHaveBeenCalled()
    })

    it('refuses to reconnect an account with no enrolled email to sign in as', async () => {
      const { fs } = fakeFs()
      const runner = fakeRunner()
      repository.create({
        id: 'anonymous',
        providerId: 'claude-code',
        label: 'anonymous',
        authKind: 'subscription-oauth',
        configDir: CONFIG_DIR,
        credentialDir: CREDENTIAL_DIR,
        executionHostId: 'local',
      })

      await expect(
        service({ fs, run: runner.run }).reconnect('anonymous'),
      ).rejects.toThrow(/no recorded email/)
      expect(runner.run).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('refuses to sign out or delete the only copy of private history until deletion is explicit', async () => {
      const { fs, files, removed } = fakeFs()
      const runner = fakeRunner({}, loginWritesIdentity(files))
      const subject = service({ fs, run: runner.run })
      await subject.enrol({ email: 'someone@example.com' })
      files.set(`${CONFIG_DIR}/projects/only-copy.jsonl`, 'private fixture')
      await expect(subject.remove(ACCOUNT_ID)).rejects.toThrow(
        /private history or data.*projects/,
      )
      expect(repository.get(ACCOUNT_ID)?.status).toBe('connected')
      expect(runner.run).toHaveBeenCalledTimes(1)
      expect(removed).not.toContain(CONFIG_DIR)
      await subject.remove(ACCOUNT_ID, { deletePrivateHistory: true })
      expect(repository.get(ACCOUNT_ID)).toBeNull()
      expect(removed).toContain(CONFIG_DIR)
    })
    it('can remove a legacy non-local Claude row without a local process gate', async () => {
      const { fs, removed } = fakeFs()
      const runner = fakeRunner()
      const maintenance = {
        run: vi.fn(async () => {
          throw new Error('No local process')
        }),
      }
      const subject = service({
        fs,
        run: runner.run,
        claudeMaintenance: maintenance,
      })
      repository.create({
        id: ACCOUNT_ID,
        label: 'Legacy',
        authKind: 'subscription-oauth',
        configDir: CONFIG_DIR,
        credentialDir: CREDENTIAL_DIR,
        email: 'someone@example.com',
        providerId: 'claude-code',
        executionHostId: 'little-monster',
      })
      await subject.remove(ACCOUNT_ID)
      expect(repository.get(ACCOUNT_ID)).toBeNull()
      expect(maintenance.run).not.toHaveBeenCalled()
      expect(removed).toContain(CONFIG_DIR)
      expect(removed).toContain(CREDENTIAL_DIR)
    })
    it('preserves the account and its directories when sign-out exits unsuccessfully', async () => {
      const { fs, files, removed } = fakeFs()
      const runner = fakeRunner({}, loginWritesIdentity(files))
      const subject = service({ fs, run: runner.run })
      await subject.enrol({ email: 'someone@example.com' })
      runner.run.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'secret-fixture',
      })
      await expect(subject.remove(ACCOUNT_ID)).rejects.toThrow(
        /sign-out failed/,
      )
      expect(repository.get(ACCOUNT_ID)?.status).toBe('unavailable')
      expect(removed).not.toContain(CONFIG_DIR)
      expect(removed).not.toContain(CREDENTIAL_DIR)
    })
    async function enrolled() {
      const { fs, removed, files } = fakeFs()
      const runner = fakeRunner({}, loginWritesIdentity(files))
      const subject = service({ fs, run: runner.run })
      await subject.enrol({ email: 'someone@example.com' })
      runner.calls.length = 0
      return { subject, runner, removed, fs }
    }

    it('logs out through a throwaway config dir, never the shared profile', async () => {
      const { subject, runner } = await enrolled()

      await subject.remove(ACCOUNT_ID)

      expect(runner.calls).toHaveLength(1)
      expect(runner.calls[0].args).toEqual(['auth', 'logout'])
      expect(runner.calls[0].env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
        CREDENTIAL_DIR,
      )
      expect(runner.calls[0].env.CLAUDE_CONFIG_DIR).toMatch(
        /\.convergence\/tmp\/logout-/,
      )
      expect(runner.calls[0].env.CLAUDE_CONFIG_DIR).not.toBe(`${HOME}/.claude`)
    })

    it('removes the row and both account directories', async () => {
      const { subject, removed } = await enrolled()

      await subject.remove(ACCOUNT_ID)

      expect(repository.get(ACCOUNT_ID)).toBeNull()
      expect(removed).toContain(CONFIG_DIR)
      expect(removed).toContain(CREDENTIAL_DIR)
    })

    it('never deletes a directory outside the account root', async () => {
      const { fs, removed } = fakeFs()
      const runner = fakeRunner()
      const subject = service({ fs, run: runner.run })
      repository.create({
        id: 'tampered',
        providerId: 'claude-code',
        label: 'tampered',
        authKind: 'subscription-oauth',
        configDir: `${HOME}/.claude`,
        credentialDir: `${HOME}/.convergence/provider-credentials/claude/x`,
        executionHostId: 'local',
      })

      await expect(subject.remove('tampered')).rejects.toThrow(
        /not a direct child/,
      )
      expect(removed).not.toContain(`${HOME}/.claude`)
    })

    it('does nothing for an account that is not enrolled', async () => {
      const { fs } = fakeFs()
      const runner = fakeRunner()

      await service({ fs, run: runner.run }).remove('missing')

      expect(runner.run).not.toHaveBeenCalled()
    })
  })

  describe('sweepOrphanCredentialNamespaces', () => {
    it('does not remove an orphan namespace when its sign-out fails', async () => {
      const orphan = `${HOME}/.convergence/provider-credentials/claude/orphan`
      const { fs, removed } = fakeFs({ [`${orphan}/state`]: 'fixture' })
      const runner = fakeRunner({ code: 1 })
      await expect(
        service({ fs, run: runner.run }).sweepOrphanCredentialNamespaces(),
      ).rejects.toThrow(/sign-out failed/)
      expect(removed).not.toContain(orphan)
    })
    it('logs out namespaces no enrolled account claims', async () => {
      const { fs, removed } = fakeFs({
        [`${HOME}/.convergence/provider-credentials/claude/abandoned/x`]: '{}',
        [`${HOME}/.convergence/provider-credentials/claude/${ACCOUNT_ID}/x`]:
          '{}',
      })
      const runner = fakeRunner()
      const subject = service({ fs, run: runner.run })
      repository.create({
        id: ACCOUNT_ID,
        providerId: 'claude-code',
        label: 'kept',
        authKind: 'subscription-oauth',
        configDir: CONFIG_DIR,
        credentialDir: CREDENTIAL_DIR,
        executionHostId: 'local',
      })

      const swept = await subject.sweepOrphanCredentialNamespaces()

      expect(swept).toEqual([
        `${HOME}/.convergence/provider-credentials/claude/abandoned`,
      ])
      expect(removed).toContain(
        `${HOME}/.convergence/provider-credentials/claude/abandoned`,
      )
      expect(removed).not.toContain(CREDENTIAL_DIR)
      expect(runner.calls).toHaveLength(1)
      expect(runner.calls[0].env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
        `${HOME}/.convergence/provider-credentials/claude/abandoned`,
      )
    })

    it('sweeps nothing when there is no credential root yet', async () => {
      const { fs } = fakeFs()
      const runner = fakeRunner()

      expect(
        await service({
          fs,
          run: runner.run,
        }).sweepOrphanCredentialNamespaces(),
      ).toEqual([])
      expect(runner.run).not.toHaveBeenCalled()
    })
  })
})
