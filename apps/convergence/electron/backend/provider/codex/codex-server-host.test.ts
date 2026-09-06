import { describe, expect, it, vi } from 'vitest'
import {
  CodexServerHost,
  CodexServerHostRegistry,
  type CodexServerHostOptions,
  type CodexServerObituary,
} from './codex-server-host'
import {
  FakeCodexChildProcess,
  FakeCodexServer,
  type FakeCodexServerOptions,
} from './codex-server-host.fixture'
import type { CodexAccountEnvTarget } from '../../provider-account/provider-account-codex-env.pure'

function createEnvironment(
  options: {
    version?: string | null
    listenUrl?: string
    readyAfterProbes?: number
    announce?: boolean
    serverOptions?: FakeCodexServerOptions
    ignoresSigterm?: boolean
    processTable?: Array<{ pid: number; ppid: number }>
  } = {},
) {
  const children: FakeCodexChildProcess[] = []
  const servers: FakeCodexServer[] = []
  const spawnArgs: Array<{ binaryPath: string; args: string[]; env: unknown }> =
    []
  const killJournal: Array<{ pid: number; signal: NodeJS.Signals }> = []
  let probes = 0
  const listenUrl = options.listenUrl ?? 'ws://127.0.0.1:5150'

  const registry = new CodexServerHostRegistry({
    appVersion: '0.46.13',
    cwd: '/tmp',
    spawnProcess: (binaryPath, args, spawnOptions) => {
      spawnArgs.push({ binaryPath, args, env: spawnOptions.env })
      const child = new FakeCodexChildProcess({
        ignoresSigterm: options.ignoresSigterm,
        onKill: (pid, signal) => killJournal.push({ pid, signal }),
      })
      children.push(child)
      servers.push(new FakeCodexServer(options.serverOptions))
      if (options.announce !== false) {
        setTimeout(() => child.announceListening(listenUrl), 0)
      }
      return child.asChildProcess()
    },
    probeReady: async () => {
      probes += 1
      return probes > (options.readyAfterProbes ?? 0)
    },
    connectTransport: async () => {
      const server = servers[servers.length - 1]
      if (!server) throw new Error('no server running')
      return server.connect()
    },
    listProcesses: () => options.processTable ?? [],
    killPid: (pid, signal) => killJournal.push({ pid, signal }),
  })
  registry.setBinary('/usr/local/bin/codex', options.version ?? '0.153.4')

  return {
    registry,
    children,
    servers,
    spawnArgs,
    killJournal,
    probeCount: () => probes,
  }
}

/**
 * One host, wired by hand.
 *
 * The registry deliberately does not expose the start budget — production has
 * exactly one — but the cases below are *about* the budget and the ownership of
 * a child across it, so they build the host themselves rather than waiting 90s.
 */
function createHost(
  overrides: Partial<CodexServerHostOptions> & {
    onSpawn?: (child: FakeCodexChildProcess) => void
    ignoresSigterm?: boolean
  } = {},
) {
  const children: FakeCodexChildProcess[] = []
  const killJournal: Array<{ pid: number; signal: NodeJS.Signals }> = []
  const { onSpawn, ignoresSigterm, ...hostOverrides } = overrides

  const host = new CodexServerHost({
    key: 'local::ambient-default',
    binaryPath: '/usr/local/bin/codex',
    version: '0.153.4',
    account: null,
    appVersion: '0.46.13',
    cwd: '/tmp',
    spawnProcess: () => {
      const child = new FakeCodexChildProcess({
        ignoresSigterm,
        pid: 4242 + children.length,
        onKill: (pid, signal) => killJournal.push({ pid, signal }),
      })
      children.push(child)
      onSpawn?.(child)
      return child.asChildProcess()
    },
    probeReady: async () => true,
    listProcesses: () => [],
    killPid: (pid, signal) => killJournal.push({ pid, signal }),
    ...hostOverrides,
  })

  return { host, children, killJournal }
}

const accountA: CodexAccountEnvTarget = {
  configDir: '/homes/a',
} as CodexAccountEnvTarget
const accountB: CodexAccountEnvTarget = {
  configDir: '/homes/b',
} as CodexAccountEnvTarget

describe('CodexServerHost', () => {
  it('spawns the WebSocket listener once, however many callers ask at once', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: null })

    // Four sessions, a quota read and capability discovery, all at once.
    const connections = await Promise.all([
      host.connect(),
      host.connect(),
      host.connect(),
      host.connect(),
      host.run(async (rpc) => rpc.request('account/rateLimits/read', {})),
      host.run(async (rpc) => rpc.request('model/list', {})),
    ])

    expect(env.children).toHaveLength(1)
    expect(env.spawnArgs[0].args).toEqual([
      'app-server',
      '--listen',
      'ws://127.0.0.1:0',
    ])
    expect(env.servers[0].connections).toHaveLength(6)
    for (const connection of connections.slice(0, 4)) {
      if (typeof connection === 'object' && connection && 'close' in connection)
        (connection as { close: () => void }).close()
    }
  })

  it('gives the same host back for one account and a separate one per account', async () => {
    const env = createEnvironment()

    expect(env.registry.get({ account: accountA })).toBe(
      env.registry.get({ account: accountA }),
    )

    await env.registry.get({ account: accountA }).connect()
    await env.registry.get({ account: accountB }).connect()

    expect(env.children).toHaveLength(2)
  })

  it('waits for /readyz before handing out a connection', async () => {
    const env = createEnvironment({ readyAfterProbes: 3 })
    const host = env.registry.get({ account: null })

    await host.connect()

    expect(env.probeCount()).toBe(4)
    expect(host.isReady()).toBe(true)
  })

  it('refuses a binary too old to host the server, without spawning it', async () => {
    const env = createEnvironment({ version: '0.152.9' })

    await expect(env.registry.get({ account: null }).connect()).rejects.toThrow(
      /0\.153\.0 or newer/,
    )
    expect(env.children).toHaveLength(0)
  })

  it('reports the server own words when it dies during the start', async () => {
    const env = createEnvironment({ announce: false })
    const connecting = env.registry.get({ account: null }).connect()
    await Promise.resolve()
    env.children[0].log('failed to initialize sqlite state runtime')
    env.children[0].exit(1)

    await expect(connecting).rejects.toThrow(/sqlite state runtime/)
  })

  it('closing a connection never signals the server', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: null })

    const first = await host.connect()
    const second = await host.connect()
    first.close()
    second.close()

    expect(env.children[0].signals).toEqual([])
    expect(env.children[0].exitCode).toBeNull()
    expect(host.isReady()).toBe(true)
  })

  it('notes a death, then respawns lazily on the next connect', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: null })
    const obituaries: CodexServerObituary[] = []
    host.onDeath((obituary) => obituaries.push(obituary))

    const first = await host.connect()
    env.children[0].log('panicked at src/main.rs')
    env.children[0].exit(101)

    expect(obituaries).toHaveLength(1)
    expect(obituaries[0].note).toContain('exited with code 101')
    expect(obituaries[0].note).toContain('panicked at src/main.rs')
    expect(host.isReady()).toBe(false)

    const second = await host.connect()
    expect(env.children).toHaveLength(2)
    expect(second.generation).toBe(first.generation + 1)
  })

  it('stops the server on app quit, and only there', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: null })
    await host.connect()

    env.registry.stopAll()

    expect(env.children[0].signals).toEqual(['SIGTERM'])
  })

  it('escalates to SIGKILL when the server ignores the polite signal', async () => {
    // Quit does not wait for a server to feel like leaving. The per-session
    // runtime escalated after 3s; the resident one dropped it, so a server
    // wedged on its own state outlived the app that spawned it (MAR-2823).
    const env = createEnvironment({ ignoresSigterm: true })
    const host = env.registry.get({ account: null })
    await host.connect()

    vi.useFakeTimers()
    try {
      env.registry.stopAll()
      expect(env.children[0].signals).toEqual(['SIGTERM'])
      expect(env.children[0].exitCode).toBeNull()

      vi.advanceTimersByTime(3_000)

      expect(env.children[0].signals).toEqual(['SIGTERM', 'SIGKILL'])
      expect(env.children[0].signalCode).toBe('SIGKILL')
    } finally {
      vi.useRealTimers()
    }
  })

  it('escalates through the whole process tree, descendants before the shim', async () => {
    // `codex` on npm is a Node shim that execs the vendored Rust binary, so the
    // process we spawn is never the process that holds the port. SIGKILL cannot
    // be forwarded, so killing only the shim orphans the grandchild in exactly
    // the wedged case the escalation exists for (MAR-2823 L2'). The spawn shape
    // stays non-detached — a detached server would survive Ctrl-C in dev and
    // orphan itself on every restart — so the tree is found by parentage.
    const env = createEnvironment({
      ignoresSigterm: true,
      processTable: [
        { pid: 999, ppid: 1 },
        { pid: 4242, ppid: 999 },
        { pid: 4243, ppid: 4242 },
        { pid: 4244, ppid: 4243 },
        { pid: 5000, ppid: 999 },
      ],
    })
    await env.registry.get({ account: null }).connect()

    vi.useFakeTimers()
    try {
      env.registry.stopAll()
      expect(env.killJournal).toEqual([{ pid: 4242, signal: 'SIGTERM' }])

      vi.advanceTimersByTime(3_000)

      expect(env.killJournal).toEqual([
        { pid: 4242, signal: 'SIGTERM' },
        { pid: 4244, signal: 'SIGKILL' },
        { pid: 4243, signal: 'SIGKILL' },
        { pid: 4242, signal: 'SIGKILL' },
      ])
      // The shim's sibling under the same parent is a stranger's process.
      expect(env.killJournal.map((entry) => entry.pid)).not.toContain(5000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('carries the account home into the spawned server environment', async () => {
    const env = createEnvironment()
    await env.registry
      .get({
        account: { configDir: '/homes/a' } as CodexAccountEnvTarget,
      })
      .connect()

    expect((env.spawnArgs[0].env as Record<string, string>).CODEX_HOME).toBe(
      '/homes/a',
    )
  })

  it('hands each connection its own initialize handshake', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: null })
    await host.connect()
    await host.connect()

    const server = env.servers[0]
    expect(
      server.methodsCalled().filter((m) => m === 'initialize'),
    ).toHaveLength(2)
    expect(server.connections[0].methods()).toContain('initialized')
  })

  it('closes the socket when the handshake fails instead of leaking it', async () => {
    // The transport is open before `initialize` is asked and nothing else owns
    // it: a rejected handshake used to return through this door leaving a live
    // WebSocket behind, one per attempt, on a server that outlives them all.
    const env = createEnvironment({
      serverOptions: {
        onRequest: (message) => {
          if (message.method !== 'initialize') return undefined
          throw new Error('initialize refused')
        },
      },
    })
    const host = env.registry.get({ account: null })

    await expect(host.connect()).rejects.toThrow('initialize refused')

    expect(env.servers[0].connections).toHaveLength(1)
    expect(env.servers[0].connections[0].closed).toBe(true)
    // The server itself is untouched — a bad handshake is not its death.
    expect(env.children[0].exitCode).toBeNull()
    expect(env.children[0].signals).toEqual([])
  })

  it('signals the child of a start that quit landed in the middle of', async () => {
    // `server` is only assigned once `/readyz` answers, so for the whole cold
    // start — up to 90s of it — `stop()` used to find nothing to stop and the
    // process it had already spawned outlived the app (MAR-2823 F3).
    const env = createEnvironment({ announce: false })
    const connecting = env.registry.get({ account: null }).connect()
    connecting.catch(() => {})

    expect(env.children).toHaveLength(1)
    env.registry.stopAll()

    expect(env.children[0].signals).toContain('SIGTERM')
    await expect(connecting).rejects.toThrow()
  })

  it('does not spawn a second server while a failed start is still exiting', async () => {
    // A start that times out has not released its `CODEX_HOME` until the
    // process is gone. Clearing the single-flight slot before then let the next
    // caller spawn a second app-server beside the first — the collision the
    // resident design exists to remove (MAR-2823 F3).
    const bed = createHost({ ignoresSigterm: true, startBudgetMs: 50 })

    vi.useFakeTimers()
    try {
      const first = bed.host.connect()
      first.catch(() => {})
      await vi.advanceTimersByTimeAsync(60)

      expect(bed.children).toHaveLength(1)
      expect(bed.children[0].signals).toEqual(['SIGTERM'])
      expect(bed.children[0].exitCode).toBeNull()

      const second = bed.host.connect()
      second.catch(() => {})
      await vi.advanceTimersByTimeAsync(10)
      expect(bed.children).toHaveLength(1)

      // The escalation reaches the tree, the child finally goes, and only then
      // is the host free to start another one.
      await vi.advanceTimersByTimeAsync(3_000)
      expect(bed.children[0].signalCode).toBe('SIGKILL')
      await expect(first).rejects.toThrow(/never reported a listening port/)
      await expect(second).rejects.toThrow(/never reported a listening port/)

      const third = bed.host.connect()
      third.catch(() => {})
      await vi.advanceTimersByTimeAsync(1)
      expect(bed.children).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds a readiness probe that never settles, and quotes the stderr', async () => {
    // `fetch` against a listener that accepts and never answers has no deadline
    // of its own, and an unbounded await cannot be checked against one. The
    // timeout also has to say *why*: the stderr tail is the only place the
    // process ever explains itself (MAR-2823 F7).
    const bed = createHost({
      startBudgetMs: 150,
      probeReady: () => new Promise<boolean>(() => {}),
      onSpawn: (child) =>
        setTimeout(() => {
          child.log('WARN sqlite state runtime is rebuilding\n')
          child.announceListening('ws://127.0.0.1:5150')
        }, 0),
    })

    const startedAt = Date.now()
    await expect(bed.host.connect()).rejects.toThrow(
      /did not become ready[\s\S]*sqlite state runtime is rebuilding/,
    )
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })

  it('waits for the whole banner line before choosing a port', async () => {
    // The banner arrives in chunks stderr chose, and `ws://127.0.0.1:5` — the
    // first half of `:5150` — is a perfectly well-formed address. The host
    // commits to the first one it is handed and never re-reads (MAR-2823 F8).
    const probed: string[] = []
    const bed = createHost({
      probeReady: async (readyUrl) => {
        probed.push(readyUrl)
        return true
      },
      connectTransport: async () => new FakeCodexServer().connect(),
      onSpawn: (child) =>
        setTimeout(() => {
          child.log(
            'codex app-server (WebSockets)\n  listening on: ws://127.0.0.1:5',
          )
          child.log('150\n  readyz: http://127.0.0.1:5150/readyz\n')
        }, 0),
    })

    await bed.host.connect()

    expect(probed).toEqual(['http://127.0.0.1:5150/readyz'])
    expect(bed.host.address()?.url).toBe('ws://127.0.0.1:5150')
  })

  it('does not let another session traffic keep a stuck helper request alive', async () => {
    // Quota, model list and skills are threadless: their only progress is their
    // own response. Counting every broadcast as progress meant a busy account
    // kept a genuinely stuck helper pending for as long as it stayed busy
    // (constitution A5, MAR-2823 F6).
    const server = new FakeCodexServer({ silentMethods: ['model/list'] })
    const bed = createHost({
      connectTransport: async () => server.connect(),
      onSpawn: (child) =>
        setTimeout(() => child.announceListening('ws://127.0.0.1:5150'), 0),
    })

    vi.useFakeTimers()
    try {
      const helper = bed.host.run((rpc) => rpc.request('model/list', {}))
      helper.catch(() => {})

      for (let tick = 0; tick < 15; tick += 1) {
        await vi.advanceTimersByTimeAsync(5_000)
        server.broadcast('thread/status/changed', {
          threadId: 'another-sessions-thread',
        })
      }

      await expect(helper).rejects.toThrow(/did not answer "model\/list"/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries the start after a failed one instead of caching the failure', async () => {
    const env = createEnvironment({ announce: false })
    const host = env.registry.get({ account: null })

    const failing = host.connect()
    await Promise.resolve()
    env.children[0].exit(1)
    await expect(failing).rejects.toThrow()

    setTimeout(
      () => env.children[1].announceListening('ws://127.0.0.1:5151'),
      0,
    )
    await expect(host.connect()).resolves.toBeDefined()
    expect(env.children).toHaveLength(2)
  })
})
