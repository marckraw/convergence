import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import {
  ProviderAccountEnrolmentService,
  type ProviderAccountCommandResult,
  type ProviderAccountFs,
} from './provider-account-enrolment.service'
import type { ProviderAccountCommand } from './provider-account-enrolment.pure'
import { ProviderAccountRepository } from './provider-account.repository'

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

  const fs: ProviderAccountFs = {
    mkdir: vi.fn(async (path: string) => {
      dirs.add(path)
    }),
    chmod: vi.fn(async () => {}),
    readdir: vi.fn(async (path: string) => {
      const names = entriesOf(path)
      if (!names.length && !dirs.has(path)) throw new Error(`ENOENT: ${path}`)
      return names
    }),
    symlink: vi.fn(async (target: string, path: string) => {
      if (links.has(path) || files.has(path)) throw new Error(`EEXIST: ${path}`)
      links.set(path, target)
    }),
    readFile: vi.fn(async (path: string) => {
      const contents = files.get(path)
      if (contents === undefined) throw new Error(`ENOENT: ${path}`)
      return contents
    }),
    writeFile: vi.fn(async (path: string, contents: string) => {
      files.set(path, contents)
    }),
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
      ).rejects.toThrow(/browser closed/)
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

  describe('remove', () => {
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
