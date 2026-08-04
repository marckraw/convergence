import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { ProviderAccountMcpService } from './provider-account-mcp.service'
import type { ProviderAccountCommand } from './provider-account-enrolment.pure'
import { ProviderAccountRepository } from './provider-account.repository'

const HOME = '/Users/tester'
const CONFIG_DIR = `${HOME}/.convergence/provider-accounts/claude/acct-a`
const CREDENTIAL_DIR = `${HOME}/.convergence/provider-credentials/claude/acct-a`

const LIST_OUTPUT = [
  'linear: https://mcp.linear.app/sse - ! Needs authentication',
  'github: https://api.github.com/mcp - ✓ Connected',
].join('\n')

function fakeRunner(stdout = LIST_OUTPUT, code = 0, stderr = '') {
  const calls: ProviderAccountCommand[] = []
  const run = vi.fn(async (command: ProviderAccountCommand) => {
    calls.push(command)
    return { code, stdout, stderr }
  })
  return { run, calls }
}

describe('ProviderAccountMcpService', () => {
  let repository: ProviderAccountRepository

  beforeEach(() => {
    repository = new ProviderAccountRepository(getDatabase())
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
    run: ReturnType<typeof fakeRunner>['run']
    binaryPath?: string | null
  }) {
    return new ProviderAccountMcpService({
      repository,
      runCommand: options.run,
      baseEnv: { PATH: '/usr/local/bin', HOME },
      binaryPath:
        options.binaryPath === undefined
          ? '/usr/local/bin/claude'
          : options.binaryPath,
      workingDirectory: () => '/repo',
    })
  }

  describe('listConnectors', () => {
    it('asks the account about itself, not the ambient credential', async () => {
      // `mcp list` reports whichever slot the environment points at, so the
      // ambient answer says nothing about what this account authorized.
      const runner = fakeRunner()

      await service({ run: runner.run }).listConnectors('acct-a')

      expect(runner.calls[0].args).toEqual(['mcp', 'list'])
      expect(runner.calls[0].env.CLAUDE_CONFIG_DIR).toBe(CONFIG_DIR)
      expect(runner.calls[0].env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
        CREDENTIAL_DIR,
      )
    })

    it('marks exactly the servers this account still has to authorize', async () => {
      const result = await service({ run: fakeRunner().run }).listConnectors(
        'acct-a',
      )

      expect(
        result.connectors.map((c) => [c.name, c.needsAuthorization]),
      ).toEqual([
        ['linear', true],
        ['github', false],
      ])
    })

    it('reads the ambient default without touching its environment', async () => {
      const runner = fakeRunner()

      await service({ run: runner.run }).listConnectors(null)

      expect(runner.calls[0].env).toEqual({ PATH: '/usr/local/bin', HOME })
    })

    it('degrades to an error rather than throwing at the surface', async () => {
      const run = vi.fn(async () => {
        throw new Error('claude exploded')
      })

      const result = await service({ run }).listConnectors('acct-a')

      expect(result.connectors).toEqual([])
      expect(result.error).toMatch(/claude exploded/)
    })

    it('says so when Claude Code is not on PATH', async () => {
      const result = await service({
        run: fakeRunner().run,
        binaryPath: null,
      }).listConnectors('acct-a')

      expect(result.error).toMatch(/not available on PATH/)
    })

    it('refuses to answer for an account attestation disabled', async () => {
      // Reuses PA4's resolver: authorizing or reporting for an account that
      // cannot serve turns would describe a slot nothing will ever use.
      repository.setStatus('acct-a', 'unavailable', null)

      const result = await service({ run: fakeRunner().run }).listConnectors(
        'acct-a',
      )

      expect(result.connectors).toEqual([])
      expect(result.error).toMatch(/unavailable/)
    })
  })

  describe('authorizeConnector', () => {
    it('authorizes through the account own credential slot', async () => {
      // The lying case: tokens landing in the default slot while the app
      // reports the chosen account is now connected.
      const runner = fakeRunner('', 0)

      await service({ run: runner.run }).authorizeConnector({
        accountId: 'acct-a',
        serverName: 'linear',
      })

      expect(runner.calls[0].args).toEqual(['mcp', 'login', 'linear'])
      expect(runner.calls[0].env.CLAUDE_CONFIG_DIR).toBe(CONFIG_DIR)
      expect(runner.calls[0].env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
        CREDENTIAL_DIR,
      )
      expect(runner.calls[0].cwd).toBe('/repo')
    })

    it('uses the no-browser flow when the caller cannot open one', async () => {
      const runner = fakeRunner('', 0)

      await service({ run: runner.run }).authorizeConnector({
        accountId: 'acct-a',
        serverName: 'linear',
        canOpenBrowser: false,
      })

      expect(runner.calls[0].args).toContain('--no-browser')
    })

    it('reports a failed authorization instead of pretending it worked', async () => {
      const runner = fakeRunner('', 1, 'browser closed')

      await expect(
        service({ run: runner.run }).authorizeConnector({
          accountId: 'acct-a',
          serverName: 'linear',
        }),
      ).rejects.toThrow(/browser closed/)
    })

    it('refuses to authorize for an account that cannot serve turns', async () => {
      repository.setStatus('acct-a', 'unavailable', null)
      const runner = fakeRunner('', 0)

      await expect(
        service({ run: runner.run }).authorizeConnector({
          accountId: 'acct-a',
          serverName: 'linear',
        }),
      ).rejects.toThrow(/unavailable/)
      expect(runner.run).not.toHaveBeenCalled()
    })

    it('refuses when Claude Code is not on PATH', async () => {
      const runner = fakeRunner('', 0)

      await expect(
        service({ run: runner.run, binaryPath: null }).authorizeConnector({
          accountId: 'acct-a',
          serverName: 'linear',
        }),
      ).rejects.toThrow(/not available on PATH/)
      expect(runner.run).not.toHaveBeenCalled()
    })
  })
})
