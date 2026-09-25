import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { ProviderAccountMcpService } from './provider-account-mcp.service'
import type { ProviderAccountCommand } from './provider-account-enrolment.pure'
import { ProviderAccountRepository } from './provider-account.repository'
import { ClaudeAccountMaintenance } from '../provider/claude-code/claude-account-maintenance.service'
import { CodexProvider } from '../provider/codex/codex-provider'
import { CodexServerHostRegistry } from '../provider/codex/codex-server-host'
import {
  FakeCodexChildProcess,
  FakeCodexServer,
} from '../provider/codex/codex-server-host.fixture'
import type { ProviderAccountInteractiveRunner } from './provider-account-pty-runner'
import {
  reconcileClaudeAccountConfigNow,
  type ClaudeConfigIo,
} from './provider-account-env.service'

// Pass-through spy on the spawn's own reconciliation, so Connect Linear can be
// held to calling *that* export rather than a second copy of its steps.
vi.mock('./provider-account-env.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./provider-account-env.service')>()
  return {
    ...actual,
    reconcileClaudeAccountConfigNow: vi.fn(
      actual.reconcileClaudeAccountConfigNow,
    ),
  }
})

describe('Codex connectors (MAR-3183)', () => {
  function bench(present = false, afterAddAuth = 'unknown') {
    const repository = new ProviderAccountRepository(getDatabase())
    repository.create({
      id: 'codex-test',
      providerId: 'codex',
      label: 'Codex',
      authKind: 'subscription-oauth',
      configDir: '/fixture/codex-test',
      credentialDir: '/fixture/codex-test',
      executionHostId: 'local',
    })
    const events: string[] = []
    const read = vi.fn(async (command: ProviderAccountCommand) => {
      events.push(command.args[1])
      expect(command.args).toEqual(['mcp', 'list', '--json'])
      expect(command.env.CODEX_HOME).toBe('/fixture/codex-test')
      return {
        code: 0,
        stderr: '',
        stdout: JSON.stringify(
          present || events.includes('add')
            ? [
                {
                  name: 'linear',
                  enabled: true,
                  auth_status: present ? 'o_auth' : afterAddAuth,
                },
              ]
            : [],
        ),
      }
    })
    const terminal = vi.fn<ProviderAccountInteractiveRunner>(
      async (command, lifecycle) => {
        events.push(command.args[1])
        expect(command.env.CODEX_HOME).toBe('/fixture/codex-test')
        expect(events).toContain('enter')
        expect(events).not.toContain('exit')
        lifecycle!.onExitConfirmed()
        return { code: 0, output: '' }
      },
    )
    const maintenance = {
      async run<T>(_account: unknown, work: () => Promise<T>): Promise<T> {
        events.push('enter')
        try {
          return await work()
        } finally {
          events.push('exit')
        }
      },
    }
    const subject = new ProviderAccountMcpService({
      repository,
      runCommand: read,
      runInteractiveCommand: terminal,
      codexBinaryPath: '/fixture/codex',
      baseEnv: { PATH: '/bin' },
      codexMaintenance: maintenance,
    })
    return { subject, repository, read, terminal, events, maintenance }
  }
  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('MAR-3458 R5 missing hosts return a ChatGPT error while configured connectors still list', async () => {
    const b = bench(true)
    const [apps, configured] = await Promise.all([
      b.subject.listChatGptApps('codex-test'),
      b.subject.listConnectors('codex-test'),
    ])

    expect(apps).toEqual({
      providerAccountId: 'codex-test',
      apps: [],
      requiresChatGpt: false,
      error: 'Could not read ChatGPT apps. Try Refresh.',
    })
    expect(configured).toMatchObject({
      providerAccountId: 'codex-test',
      error: null,
      connectors: [{ name: 'linear', needsAuthorization: false }],
    })
    expect(b.read).toHaveBeenCalledOnce()
    expect(b.terminal).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'adds only missing Linear then logs in inside one door (present=%s)',
    async (present) => {
      const b = bench(present)
      await b.subject.connectLinear('codex-test')
      expect(b.events).toEqual(
        present
          ? ['list', 'enter', 'login', 'exit']
          : ['list', 'enter', 'add', 'list', 'login', 'exit'],
      )
      expect(b.terminal.mock.calls.map(([c]) => c.args)).toEqual(
        present
          ? [['mcp', 'login', 'linear']]
          : [
              ['mcp', 'add', 'linear', '--url', 'https://mcp.linear.app/mcp'],
              ['mcp', 'login', 'linear'],
            ],
      )
    },
  )
  it('does not log in again when add already authorized Linear', async () => {
    const b = bench(false, 'o_auth')
    await b.subject.connectLinear('codex-test')
    expect(b.events).toEqual(['list', 'enter', 'add', 'list', 'exit'])
    expect(b.terminal).toHaveBeenCalledOnce()
  })
  it.each(['authorize', 'connectLinear'] as const)(
    'R4: %s evicts an idle conversation before running its command',
    async (action) => {
      const b = bench()
      const account = b.repository.get('codex-test')!
      const server = new FakeCodexServer()
      const hosts = new CodexServerHostRegistry({
        cwd: '/tmp',
        spawnProcess: () => {
          const child = new FakeCodexChildProcess()
          setTimeout(() => child.announceListening('ws://127.0.0.1:5150'), 0)
          return child.asChildProcess()
        },
        probeReady: async () => true,
        connectTransport: async () => server.connect(),
        listProcesses: () => [],
      })
      hosts.setBinary('/fixture/codex', '0.154.0')
      const handle = new CodexProvider(
        hosts,
        null,
        undefined,
        () => account,
      ).start({
        sessionId: 'idle-mcp',
        workingDirectory: '/tmp',
        initialMessage: 'first',
        continuationToken: null,
        providerAccountId: account.id,
        model: 'gpt-6',
        effort: 'high',
      })
      let status = 'running'
      handle.onStatusChange((value) => {
        status = value
      })
      try {
        await vi.waitFor(() => expect(status).toBe('completed'))
        const original = server.requests.find(
          (request) => request.method === 'turn/start',
        )!.connection
        const run = b.maintenance.run.bind(b.maintenance)
        b.maintenance.run = (_target, work) =>
          hosts.withStoppedServer({ account }, () => run(account, work))
        const terminal = b.terminal.getMockImplementation()!
        b.terminal.mockImplementation((command, lifecycle) => {
          expect(original.closed).toBe(true)
          expect(hosts.get({ account }).isReady()).toBe(false)
          return terminal(command, lifecycle)
        })
        if (action === 'authorize')
          await b.subject.authorizeConnector({
            accountId: account.id,
            serverName: 'linear',
          })
        else await b.subject.connectLinear(account.id)
        expect(b.terminal).toHaveBeenCalled()
        expect(original.closed).toBe(true)
      } finally {
        await handle.dispose?.()
        await hosts.stopAll()
      }
    },
  )
  it('does not log in when authorization is unsupported after add', async () => {
    const b = bench(false, 'unsupported')
    await b.subject.connectLinear('codex-test')
    expect(b.events).toEqual(['list', 'enter', 'add', 'list', 'exit'])
    expect(b.terminal).toHaveBeenCalledOnce()
  })
  it('names the server in a failed login', async () => {
    const b = bench()
    b.terminal.mockImplementation(async (_command, lifecycle) => {
      lifecycle!.onExitConfirmed()
      return { code: 1, output: '' }
    })
    await expect(
      b.subject.authorizeConnector({
        accountId: 'codex-test',
        serverName: 'linear',
      }),
    ).rejects.toThrow('Codex connector linear failed (exit code 1).')
  })
  it('holds the Codex door after a result until confirmed exit', async () => {
    const b = bench()
    let confirm!: () => void
    b.terminal.mockImplementation(async (_command, lifecycle) => {
      confirm = lifecycle!.onExitConfirmed
      return { code: 0, output: '' }
    })
    let settled = false
    const pending = b.subject
      .authorizeConnector({ accountId: 'codex-test', serverName: 'linear' })
      .then(() => {
        settled = true
      })
    await vi.waitFor(() => expect(b.terminal).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(b.events).toEqual(['enter'])
    expect(settled).toBe(false)
    confirm()
    await pending
    expect(b.events).toEqual(['enter', 'exit'])
  })
  it('closes the door when login throws', async () => {
    const b = bench()
    b.terminal.mockRejectedValue(new Error('terminal failed'))
    await expect(
      b.subject.authorizeConnector({
        accountId: 'codex-test',
        serverName: 'linear',
      }),
    ).rejects.toThrow('terminal failed')
    expect(b.events).toEqual(['enter', 'exit'])
  })
  it('refuses unguarded authorization and preserves maintenance refusals verbatim', async () => {
    const b = bench()
    const unguarded = new ProviderAccountMcpService({
      repository: b.repository,
      codexBinaryPath: '/fixture/codex',
      runInteractiveCommand: b.terminal,
    })
    await expect(
      unguarded.authorizeConnector({
        accountId: 'codex-test',
        serverName: 'linear',
      }),
    ).rejects.toThrow('Codex account maintenance is unavailable.')
    b.maintenance.run = async () => {
      throw new Error(
        'This Codex account is running a turn. Try again when it finishes.',
      )
    }
    await expect(
      b.subject.authorizeConnector({
        accountId: 'codex-test',
        serverName: 'linear',
      }),
    ).rejects.toThrow(
      /^This Codex account is running a turn\. Try again when it finishes\.$/,
    )
    expect(b.terminal).not.toHaveBeenCalled()
  })
  it('lists outside maintenance and reports malformed output as an error', async () => {
    const b = bench()
    expect(await b.subject.listConnectors('codex-test')).toMatchObject({
      connectors: [],
      error: null,
    })
    expect(b.events).toEqual(['list'])
    b.read.mockResolvedValue({ code: 0, stdout: '{}', stderr: '' })
    expect((await b.subject.listConnectors('codex-test')).error).toBe(
      'Codex returned an invalid connector list.',
    )
  })
  it.each(['{}', '{"servers":[]}', '{'])(
    'refuses invalid list %s without starting Connect Linear',
    async (stdout) => {
      const b = bench()
      b.read.mockResolvedValue({ code: 0, stdout, stderr: '' })
      expect(await b.subject.listConnectors('codex-test')).toMatchObject({
        connectors: [],
        error: 'Codex returned an invalid connector list.',
      })
      await expect(b.subject.connectLinear('codex-test')).rejects.toThrow(
        'Codex returned an invalid connector list.',
      )
      expect(b.terminal).not.toHaveBeenCalled()
      expect(b.events).not.toContain('enter')
    },
  )
  it.each(['{}', '{"servers":[]}', '{'])(
    'refuses invalid re-read %s after add without logging in',
    async (stdout) => {
      const b = bench()
      b.read.mockImplementation(async () => {
        b.events.push('list')
        return {
          code: 0,
          stdout: b.events.includes('add') ? stdout : '[]',
          stderr: '',
        }
      })
      await expect(b.subject.connectLinear('codex-test')).rejects.toThrow(
        'Codex returned an invalid connector list.',
      )
      expect(b.events).toEqual(['list', 'enter', 'add', 'list', 'exit'])
      expect(b.terminal).toHaveBeenCalledOnce()
    },
  )
})

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

  it('holds account admission through connector authorization and refuses authorization during maintenance', async () => {
    const gate = new ClaudeAccountMaintenance()
    let complete!: () => void
    const ceremony = new Promise<void>((resolve) => {
      complete = resolve
    })
    const run = vi.fn(async () => {
      await ceremony
      return { code: 0, output: '' }
    })
    const subject = new ProviderAccountMcpService({
      repository,
      accountMaintenance: gate,
      binaryPath: '/fixture/claude',
      runInteractiveCommand: run,
    })
    const pending = subject.authorizeConnector({
      accountId: 'acct-a',
      serverName: 'linear',
    })
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    await expect(gate.run('acct-a', async () => {})).rejects.toThrow(/active/)
    complete()
    await pending
    await gate.run('acct-a', async () => {
      await expect(
        subject.authorizeConnector({
          accountId: 'acct-a',
          serverName: 'linear',
        }),
      ).rejects.toThrow(/being updated/)
    })
    expect(run).toHaveBeenCalledTimes(1)
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

  it.each(['list', 'authorize'] as const)(
    'refuses to %s Codex connectors when only the Claude binary is available',
    async (operation) => {
      repository.create({
        id: 'codex-a',
        providerId: 'codex',
        label: 'OpenAI',
        authKind: 'subscription-oauth',
        configDir: '/codex',
        credentialDir: '/codex',
        executionHostId: 'local',
      })
      const read = fakeRunner()
      const write = fakeInteractiveRunner()
      const subject = service({ run: read.run, runInteractive: write.run })
      if (operation === 'list') {
        const result = await subject.listConnectors('codex-a')
        expect(result.error).toContain('Codex is not available on PATH')
        expect(result.connectors).toEqual([])
      } else {
        await expect(
          subject.authorizeConnector({
            accountId: 'codex-a',
            serverName: 'linear',
          }),
        ).rejects.toThrow('Codex is not available on PATH')
      }
      expect(read.calls).toEqual([])
      expect(write.calls).toEqual([])
    },
  )

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

    it('MAR-3205: surfaces a heavy-check Connected server through listConnectors', async () => {
      const stdout = [
        'linear: https://mcp.linear.app/sse - ✔ Connected',
        'plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ✔ Connected',
      ].join('\n')

      const result = await service({
        run: fakeRunner(stdout).run,
      }).listConnectors('acct-a')

      expect(
        result.connectors.map((c) => [c.name, c.status, c.needsAuthorization]),
      ).toEqual([
        ['linear', 'ready', false],
        ['plugin:figma:figma', 'ready', false],
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

describe('Claude Connect Linear (MAR-3185)', () => {
  const SHARED_FILE = `${HOME}/.claude.json`
  const ACCOUNT_FILE = `${CONFIG_DIR}/.claude.json`
  const LINEAR = { type: 'http', url: 'https://mcp.linear.app/mcp' }
  const GITHUB = { type: 'http', url: 'https://api.github.com/mcp' }

  let repository: ProviderAccountRepository

  beforeEach(() => {
    vi.mocked(reconcileClaudeAccountConfigNow).mockClear()
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

  /**
   * A fake disk plus both runners, recording one timeline. The piped runner's
   * `mcp add` writes the shared file the way the measured CLI does, and
   * refuses an existing name the way it does (exit 1, file untouched).
   */
  function bench(files: {
    shared?: Record<string, unknown> | null | 'garbage'
    account?: Record<string, unknown> | null | 'garbage'
    canOpenBrowser?: boolean
  }) {
    const disk = new Map<string, string>()
    if (files.shared === 'garbage') disk.set(SHARED_FILE, '{not json')
    else if (files.shared) disk.set(SHARED_FILE, JSON.stringify(files.shared))
    if (files.account === 'garbage') disk.set(ACCOUNT_FILE, '{not json')
    else if (files.account)
      disk.set(ACCOUNT_FILE, JSON.stringify(files.account))
    const events: string[] = []
    const io: ClaudeConfigIo = {
      readFile: async (path) => {
        const contents = disk.get(path)
        if (contents === undefined)
          throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
        return contents
      },
      writeFile: async (path, contents) => {
        disk.set(path, contents)
      },
      rename: async (from, to) => {
        disk.set(to, disk.get(from)!)
        disk.delete(from)
        events.push(to === ACCOUNT_FILE ? 'write-account' : `write ${to}`)
      },
    }
    const piped = vi.fn(async (command: ProviderAccountCommand) => {
      events.push(command.args[1])
      if (command.args[1] === 'login')
        return { code: 1, stdout: '', stderr: PIPED_STDIO_REFUSAL }
      if (command.args[1] !== 'add')
        return { code: 0, stdout: LIST_OUTPUT, stderr: '' }
      const shared = disk.has(SHARED_FILE)
        ? (JSON.parse(disk.get(SHARED_FILE)!) as Record<string, unknown>)
        : {}
      const servers = (shared.mcpServers ?? {}) as Record<string, unknown>
      const [name, url] = command.args.slice(-2)
      if (servers[name])
        return {
          code: 1,
          stdout: '',
          stderr: `MCP server ${name} already exists in user config`,
        }
      disk.set(
        SHARED_FILE,
        JSON.stringify({
          ...shared,
          mcpServers: { ...servers, [name]: { type: 'http', url } },
        }),
      )
      return { code: 0, stdout: 'Added HTTP MCP server', stderr: '' }
    })
    const terminal = vi.fn<ProviderAccountInteractiveRunner>(
      async (command) => {
        events.push(command.args[1])
        return { code: 0, output: 'Authenticated.' }
      },
    )
    const gate = new ClaudeAccountMaintenance()
    const subject = new ProviderAccountMcpService({
      repository,
      runCommand: piped,
      runInteractiveCommand: terminal,
      baseEnv: { PATH: '/usr/local/bin', HOME },
      binaryPath: '/usr/local/bin/claude',
      workingDirectory: () => '/repo',
      accountMaintenance: gate,
      homeDir: HOME,
      claudeConfigIo: io,
    })
    const connect = () =>
      subject.connectLinear('acct-a', {
        canOpenBrowser: files.canOpenBrowser,
      })
    const readAccount = () =>
      JSON.parse(disk.get(ACCOUNT_FILE) ?? 'null') as {
        mcpServers?: Record<string, unknown>
      } | null
    const readShared = () =>
      JSON.parse(disk.get(SHARED_FILE) ?? 'null') as {
        mcpServers?: Record<string, unknown>
      } | null
    return { connect, piped, terminal, events, readAccount, readShared, gate }
  }

  it.each([
    {
      case: 'shared and account both have linear → login only',
      shared: { mcpServers: { linear: LINEAR } },
      account: { mcpServers: { linear: LINEAR } },
      sequence: ['login'],
    },
    {
      case: 'shared has linear, the account drifted → reconcile, login, no add',
      shared: { mcpServers: { linear: LINEAR, github: GITHUB } },
      account: { mcpServers: { github: GITHUB } },
      sequence: ['write-account', 'login'],
    },
    {
      case: 'shared lacks linear → add, reconcile, login',
      shared: { mcpServers: { github: GITHUB } },
      account: { mcpServers: { github: GITHUB } },
      sequence: ['add', 'write-account', 'login'],
    },
    {
      case: 'no shared profile yet → add, reconcile, login',
      shared: null,
      account: null,
      sequence: ['add', 'write-account', 'login'],
    },
  ])('R4 adds only what is missing: $case', async (input) => {
    const b = bench(input)

    await b.connect()

    expect(b.events).toEqual(input.sequence)
    // Whatever the path, the account ends with the shared entry itself.
    expect(b.readAccount()?.mcpServers?.linear).toEqual(LINEAR)
    expect(b.readShared()?.mcpServers?.linear).toEqual(LINEAR)
  })

  it('R1 the add is the only command without the account directory; the rest run as the account', async () => {
    const b = bench({ shared: {}, account: {} })

    await b.connect()

    const add = b.piped.mock.calls.map(([command]) => command)
    expect(add.map((command) => command.args)).toEqual([
      [
        'mcp',
        'add',
        '-s',
        'user',
        '--transport',
        'http',
        'linear',
        'https://mcp.linear.app/mcp',
      ],
    ])
    expect(add[0].env).not.toHaveProperty('CLAUDE_CONFIG_DIR')
    expect(add[0].env).not.toHaveProperty('CLAUDE_SECURESTORAGE_CONFIG_DIR')
    for (const [command] of b.terminal.mock.calls)
      expect(command.env.CLAUDE_CONFIG_DIR).toBe(CONFIG_DIR)
  })

  it('R2 reconciles the account from the shared entry with the spawn’s own export, before the login', async () => {
    const b = bench({
      shared: { mcpServers: { github: GITHUB }, projects: { '/x': {} } },
      account: {
        mcpServers: { github: GITHUB },
        oauthAccount: { emailAddress: 'a@example.com' },
      },
    })

    await b.connect()

    expect(b.readAccount()).toEqual({
      mcpServers: {
        github: GITHUB,
        linear: b.readShared()!.mcpServers!.linear,
      },
      // Every other key of the account's file stands: identity is its own.
      oauthAccount: { emailAddress: 'a@example.com' },
    })
    expect(b.events.indexOf('write-account')).toBeLessThan(
      b.events.indexOf('login'),
    )
    expect(vi.mocked(reconcileClaudeAccountConfigNow)).toHaveBeenCalledOnce()
    expect(
      vi.mocked(reconcileClaudeAccountConfigNow).mock.calls[0][0],
    ).toMatchObject({
      account: { configDir: CONFIG_DIR, credentialDir: CREDENTIAL_DIR },
      homeDir: HOME,
    })
  })

  it('R3 authorizes on a terminal as the account, never through the pipe', async () => {
    const b = bench({
      shared: { mcpServers: { linear: LINEAR } },
      account: { mcpServers: { linear: LINEAR } },
    })

    await b.connect()

    expect(b.terminal).toHaveBeenCalledOnce()
    const [login] = b.terminal.mock.calls[0]
    expect(login.args).toEqual(['mcp', 'login', 'linear'])
    expect(login.env.CLAUDE_CONFIG_DIR).toBe(CONFIG_DIR)
    expect(login.env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(CREDENTIAL_DIR)
    expect(b.piped.mock.calls.map(([c]) => c.args[1])).not.toContain('login')
  })

  it('R3 keeps the no-browser rule of the existing door', async () => {
    const b = bench({
      shared: { mcpServers: { linear: LINEAR } },
      account: { mcpServers: { linear: LINEAR } },
      canOpenBrowser: false,
    })

    await b.connect()

    expect(b.terminal.mock.calls[0][0].args).toEqual([
      'mcp',
      'login',
      'linear',
      '--no-browser',
    ])
  })

  it('stops before reconciling or authorizing when the add fails', async () => {
    const b = bench({ shared: {}, account: {} })
    b.piped.mockResolvedValueOnce({
      code: 2,
      stdout: '',
      stderr: 'Invalid transport',
    })

    await expect(b.connect()).rejects.toThrow(
      'Claude Code could not add Linear to the shared profile (exit code 2): Invalid transport',
    )
    expect(reconcileClaudeAccountConfigNow).not.toHaveBeenCalled()
    expect(b.terminal).not.toHaveBeenCalled()
  })

  it('does not authorize a server the account file could not be given', async () => {
    const b = bench({
      shared: { mcpServers: { linear: LINEAR } },
      account: 'garbage',
    })

    await expect(b.connect()).rejects.toThrow(
      /this account’s config could not be updated, so it was not authorized/,
    )
    expect(b.terminal).not.toHaveBeenCalled()
  })

  it('refuses an unreadable shared profile without adding anything', async () => {
    const b = bench({ shared: 'garbage', account: {} })

    await expect(b.connect()).rejects.toThrow(
      `Could not read the shared Claude profile at ${SHARED_FILE}. No connectors were changed.`,
    )
    expect(b.piped).not.toHaveBeenCalled()
    expect(b.terminal).not.toHaveBeenCalled()
  })

  it('holds the account’s admission through the sequence and refuses during maintenance', async () => {
    const b = bench({ shared: {}, account: {} })

    await b.gate.run('acct-a', async () => {
      await expect(b.connect()).rejects.toThrow(/being updated/)
    })
    expect(b.piped).not.toHaveBeenCalled()
    expect(b.terminal).not.toHaveBeenCalled()
  })
})
