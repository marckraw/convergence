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

/**
 * What the CLI actually said when the Authorize button ran `mcp login`
 * through pipes (Marcin's QA, installed build, 2026-08-05). Kept verbatim so
 * any regression back to piped stdio reproduces the field failure here rather
 * than in his hands.
 */
const PIPED_STDIO_REFUSAL =
  'Couldn\'t complete authentication for "atlassian": stdin isn\'t a terminal, ' +
  'so authentication can’t be completed here. Re-run in an interactive ' +
  'terminal — e.g. `ssh -t` — and paste the redirect URL when prompted.'

function fakeRunner(stdout = LIST_OUTPUT, code = 0, stderr = '') {
  const calls: ProviderAccountCommand[] = []
  const run = vi.fn(async (command: ProviderAccountCommand) => {
    calls.push(command)
    return { code, stdout, stderr }
  })
  return { run, calls }
}

/** The fake PTY seam, one level up: a terminal-shaped runner, no node-pty. */
function fakeInteractiveRunner(output = '', code = 0) {
  const calls: ProviderAccountCommand[] = []
  const run = vi.fn(async (command: ProviderAccountCommand) => {
    calls.push(command)
    return { code, output }
  })
  return { run, calls }
}

/** A piped runner that answers the way the real CLI answers a pipe. */
function refusingPipedRunner() {
  const calls: ProviderAccountCommand[] = []
  const run = vi.fn(async (command: ProviderAccountCommand) => {
    calls.push(command)
    return command.args[1] === 'login'
      ? { code: 1, stdout: '', stderr: PIPED_STDIO_REFUSAL }
      : { code: 0, stdout: LIST_OUTPUT, stderr: '' }
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
    runInteractive?: ReturnType<typeof fakeInteractiveRunner>['run']
    binaryPath?: string | null
  }) {
    return new ProviderAccountMcpService({
      repository,
      runCommand: options.run,
      runInteractiveCommand:
        options.runInteractive ??
        (async () => {
          throw new Error('the read path must never open a terminal')
        }),
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
    it('never asks a pipe to do what only a terminal can (PA11.1)', async () => {
      // The field bug: `claude mcp login` refuses piped stdio outright, so the
      // Authorize button failed for every server. The piped runner here answers
      // exactly as the real CLI did — if login ever routes back through it,
      // this test fails with Marcin's error rather than his afternoon.
      const piped = refusingPipedRunner()
      const terminal = fakeInteractiveRunner('Authenticated.', 0)

      await service({
        run: piped.run,
        runInteractive: terminal.run,
      }).authorizeConnector({ accountId: 'acct-a', serverName: 'atlassian' })

      expect(piped.calls.map((call) => call.args)).not.toContainEqual([
        'mcp',
        'login',
        'atlassian',
      ])
      expect(terminal.calls[0].args).toEqual(['mcp', 'login', 'atlassian'])
    })

    it('authorizes through the account own credential slot', async () => {
      // The lying case: tokens landing in the default slot while the app
      // reports the chosen account is now connected. Still guarded now that
      // the command runs on a terminal.
      const terminal = fakeInteractiveRunner('', 0)

      await service({
        run: fakeRunner().run,
        runInteractive: terminal.run,
      }).authorizeConnector({
        accountId: 'acct-a',
        serverName: 'linear',
      })

      expect(terminal.calls[0].args).toEqual(['mcp', 'login', 'linear'])
      expect(terminal.calls[0].env.CLAUDE_CONFIG_DIR).toBe(CONFIG_DIR)
      expect(terminal.calls[0].env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
        CREDENTIAL_DIR,
      )
      expect(terminal.calls[0].cwd).toBe('/repo')
    })

    it('uses the no-browser flow when the caller cannot open one', async () => {
      const terminal = fakeInteractiveRunner('', 0)

      await service({
        run: fakeRunner().run,
        runInteractive: terminal.run,
      }).authorizeConnector({
        accountId: 'acct-a',
        serverName: 'linear',
        canOpenBrowser: false,
      })

      expect(terminal.calls[0].args).toContain('--no-browser')
    })

    it('reports a failed authorization instead of pretending it worked', async () => {
      const terminal = fakeInteractiveRunner('browser closed', 1)

      await expect(
        service({
          run: fakeRunner().run,
          runInteractive: terminal.run,
        }).authorizeConnector({
          accountId: 'acct-a',
          serverName: 'linear',
        }),
      ).rejects.toThrow(/browser closed/)
    })

    it('believes the terminal over a zero exit code', async () => {
      // A CLI that prints a refusal and exits 0 would otherwise flip the row to
      // connected for an account that authorized nothing.
      const terminal = fakeInteractiveRunner(PIPED_STDIO_REFUSAL, 0)

      await expect(
        service({
          run: fakeRunner().run,
          runInteractive: terminal.run,
        }).authorizeConnector({
          accountId: 'acct-a',
          serverName: 'atlassian',
        }),
      ).rejects.toThrow(/Authorizing atlassian failed/)
    })

    it('names the server when the ceremony never finishes', async () => {
      const terminal = vi.fn(async () => {
        throw new Error('timed out after 300s')
      })

      await expect(
        service({
          run: fakeRunner().run,
          runInteractive: terminal,
        }).authorizeConnector({
          accountId: 'acct-a',
          serverName: 'atlassian',
        }),
      ).rejects.toThrow(/Authorizing atlassian failed: timed out after 300s/)
    })

    it('refuses to authorize for an account that cannot serve turns', async () => {
      repository.setStatus('acct-a', 'unavailable', null)
      const terminal = fakeInteractiveRunner('', 0)

      await expect(
        service({
          run: fakeRunner().run,
          runInteractive: terminal.run,
        }).authorizeConnector({
          accountId: 'acct-a',
          serverName: 'linear',
        }),
      ).rejects.toThrow(/unavailable/)
      expect(terminal.run).not.toHaveBeenCalled()
    })

    it('refuses when Claude Code is not on PATH', async () => {
      const terminal = fakeInteractiveRunner('', 0)

      await expect(
        service({
          run: fakeRunner().run,
          runInteractive: terminal.run,
          binaryPath: null,
        }).authorizeConnector({
          accountId: 'acct-a',
          serverName: 'linear',
        }),
      ).rejects.toThrow(/not available on PATH/)
      expect(terminal.run).not.toHaveBeenCalled()
    })
  })
})
