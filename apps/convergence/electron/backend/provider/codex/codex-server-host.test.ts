import { describe, expect, it, vi } from 'vitest'
import {
  CodexServerHostRegistry,
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
