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
  it('waits for a removed binary generation to exit before changing that account credentials', async () => {
    const env = createEnvironment({ ignoresSigterm: true })
    const account = { account: accountA }
    const connection = await env.registry.get(account).connect()
    connection.close()
    env.registry.setBinary(null, null)
    const change = vi.fn(async () => {})
    const pending = env.registry.withStoppedServer(account, change)
    await Promise.resolve()
    expect(change).not.toHaveBeenCalled()
    env.children[0].exit(0)
    await pending
    expect(change).toHaveBeenCalledOnce()
    env.registry.stopAll()
  })

  it('provider detection cannot reopen an account during its credential operation', async () => {
    const env = createEnvironment()
    const account = { account: accountA }
    const connection = await env.registry.get(account).connect()
    connection.close()
    let waiting:
      | Promise<import('./codex-server-host').CodexServerConnection>
      | undefined
    await env.registry.withStoppedServer(account, async () => {
      env.registry.setBinary('/new/codex', '0.154.0')
      waiting = env.registry.get(account).connect()
      await Promise.resolve()
      expect(env.children).toHaveLength(1)
      await expect(
        env.registry.withStoppedServer(account, async () => {}),
      ).rejects.toThrow(/maintenance/)
    })
    const next = await waiting!
    expect(env.spawnArgs[1].binaryPath).toBe('/new/codex')
    next.close()
    env.registry.stopAll()
  })

  it('reopens admission after failed maintenance and releases each connection exactly once', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: accountA })
    const connection = await host.connect()
    connection.close()
    connection.close()
    await expect(
      host.withStoppedServer(async () => {
        throw new Error('login cancelled')
      }),
    ).rejects.toThrow('login cancelled')
    const next = await host.connect()
    await expect(host.withStoppedServer(async () => {})).rejects.toThrow(
      /running a turn/,
    )
    next.close()
    await host.withStoppedServer(async () => {})
    env.registry.stopAll()
  })

  it('releases the lease when the transport dies', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: accountA })
    const connection = await host.connect()
    env.servers[0].connections[0].fail('socket closed')
    await host.withStoppedServer(async () => {})
    connection.close()
    const next = await host.connect()
    await expect(host.withStoppedServer(async () => {})).rejects.toThrow(
      /running a turn/,
    )
    next.close()
    env.registry.stopAll()
  })
  it('refuses account maintenance while a connection is still starting', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: accountA })
    const connecting = host.connect()
    const mutateCredentials = vi.fn(async () => {})
    await expect(host.withStoppedServer(mutateCredentials)).rejects.toThrow(
      /running a turn/,
    )
    expect(mutateCredentials).not.toHaveBeenCalled()
    const connection = await connecting
    expect(env.killJournal).toEqual([])
    connection.close()
    env.registry.stopAll()
  })

  it('keeps admission closed until account maintenance finishes, including helper calls', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: accountA })
    const connection = await host.connect()
    connection.close()
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const maintenance = host.withStoppedServer(async () => {
      expect(
        env.children[0].exitCode !== null ||
          env.children[0].signalCode !== null,
      ).toBe(true)
      entered()
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })
    await started
    const waiting = host.connect()
    const helper = host.run(async (rpc) => rpc.request('model/list', {}))
    await Promise.resolve()
    expect(env.children).toHaveLength(1)
    release()
    await maintenance
    const next = await waiting
    await helper
    expect(env.children).toHaveLength(2)
    next.close()
    env.registry.stopAll()
  })

  it('fails an arriving connection with the same maintenance failure', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: accountA })
    let release!: () => void
    const maintenance = host.withStoppedServer(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      throw new Error('migration failed')
    })
    const failed = expect(maintenance).rejects.toThrow('migration failed')
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const waiting = expect(host.connect()).rejects.toThrow('migration failed')
    release()
    await Promise.all([failed, waiting])
    expect(env.children).toEqual([])
    const retry = await host.connect()
    retry.close()
    env.registry.stopAll()
  })

  it.each(['direct', 'registry'] as const)(
    'a refused %s handoff lets a waiting sibling send on the unchanged server',
    async (gate) => {
      const env = createEnvironment({
        serverOptions: { autoCompleteTurns: false },
      })
      const input = { account: accountA }
      const host = env.registry.get(input)
      const connection = await host.connect()
      await connection.rpc.request('thread/resume', { threadId: 'target' })
      await connection.rpc.request('turn/start', {
        threadId: 'target',
        input: [],
      })
      const generation = connection.generation
      connection.close()
      const handoff =
        gate === 'direct'
          ? host.prepareThreadHandoff('target', 'Account A')
          : env.registry.prepareThreadHandoff({
              ...input,
              threadId: 'target',
              accountLabel: 'Account A',
            })
      const refused = expect(handoff).rejects.toMatchObject({ stage: 'busy' })
      const waiting = host.connect()
      await refused
      const sibling = await waiting
      expect(sibling.generation).toBe(generation)
      await sibling.rpc.request('thread/resume', { threadId: 'sibling' })
      await sibling.rpc.request('turn/start', {
        threadId: 'sibling',
        input: [],
      })
      expect(
        env.servers[0].requests.filter((r) => r.method === 'turn/start'),
      ).toHaveLength(2)
      expect(env.killJournal).toEqual([])
      sibling.close()
      env.registry.stopAll()
    },
  )

  it('rechecks admission when a second window opens before the waiter wakes', async () => {
    let releaseFirst!: () => void
    let releaseSecond!: () => void
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const second = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })
    let gate: Promise<void> | undefined = first
    const server = new FakeCodexServer()
    const env = createHost({
      waitForAdmission: () => gate,
      onSpawn: (child) => {
        setTimeout(() => child.announceListening('ws://127.0.0.1:5150'), 0)
      },
      connectTransport: async () => server.connect(),
    })
    const waiting = env.host.connect()
    gate = second
    releaseFirst()
    await first
    expect(env.children).toHaveLength(0)
    gate = undefined
    releaseSecond()
    const connected = await waiting
    connected.close()
    await env.host.stop()
  })

  it.each(['connection', 'helper', 'warming'] as const)(
    'refuses a loaded destination held by a %s lease',
    async (kind) => {
      const env = createEnvironment()
      const host = env.registry.get({ account: accountA })
      const initial = await host.connect()
      await initial.rpc.request('thread/resume', { threadId: 'target' })
      initial.close()
      let release!: () => void
      let held: import('./codex-server-host').CodexServerConnection | undefined
      const work =
        kind === 'helper'
          ? host.run(async () => {
              await new Promise<void>((resolve) => {
                release = resolve
              })
            })
          : host.connect().then((connection) => {
              held = connection
            })
      if (kind === 'helper')
        await vi.waitFor(() => expect(release).toBeTypeOf('function'))
      else if (kind === 'connection') await work
      await expect(
        host.prepareThreadHandoff('target', 'Account A'),
      ).rejects.toMatchObject({ stage: 'busy' })
      expect(env.killJournal).toEqual([])
      if (kind === 'helper') release()
      await work
      held?.close()
      env.registry.stopAll()
    },
  )

  it('refuses a loaded handoff while server-side work outlives its socket', async () => {
    const env = createEnvironment({
      serverOptions: { autoCompleteTurns: false },
    })
    const host = env.registry.get({ account: accountA })
    const connection = await host.connect()
    await connection.rpc.request('thread/resume', { threadId: 'target' })
    await connection.rpc.request('turn/start', {
      threadId: 'target',
      input: [],
    })
    connection.close()
    await expect(
      host.prepareThreadHandoff('target', 'Account A'),
    ).rejects.toMatchObject({ stage: 'busy' })
    expect(env.children).toHaveLength(1)
    expect(env.killJournal).toEqual([])
    env.registry.stopAll()
  })

  it('restarts a loaded idle destination once and lets an arriving sibling use the replacement', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: accountA })
    const connection = await host.connect()
    await connection.rpc.request('thread/resume', { threadId: 'target' })
    await connection.rpc.request('thread/resume', { threadId: 'sibling' })
    const generation = connection.generation
    connection.close()
    const handoff = host.prepareThreadHandoff('target', 'Account A')
    const waiting = host.connect()
    await handoff
    const next = await waiting
    expect(next.generation).toBe(generation + 1)
    expect(env.children).toHaveLength(2)
    await next.rpc.request('thread/resume', { threadId: 'sibling' })
    expect(env.servers[1].methodsCalled()).not.toContain('thread/start')
    next.close()
    env.registry.stopAll()
  })

  it('does not restart when the handoff thread is not loaded, even with another live lease', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: accountA })
    const sibling = await host.connect()
    await sibling.rpc.request('thread/resume', { threadId: 'sibling' })
    await host.prepareThreadHandoff('not-loaded', 'Account A')
    expect(env.children).toHaveLength(1)
    expect(env.killJournal).toEqual([])
    sibling.close()
    env.registry.stopAll()
  })

  it('reads all loaded-thread pages before deciding whether a destination is idle', async () => {
    const env = createEnvironment({
      serverOptions: {
        onRequest: (message) => {
          if (message.method === 'thread/loaded/list')
            return message.params?.cursor
              ? { data: ['busy-sibling'], nextCursor: null }
              : { data: ['target'], nextCursor: 'next' }
          if (message.method === 'thread/read')
            return {
              thread: {
                status: {
                  type:
                    message.params?.threadId === 'busy-sibling'
                      ? 'active'
                      : 'idle',
                },
              },
            }
        },
      },
    })
    const host = env.registry.get({ account: accountA })
    const connection = await host.connect()
    connection.close()
    await expect(
      host.prepareThreadHandoff('target', 'Account A'),
    ).rejects.toMatchObject({ stage: 'busy' })
    expect(
      env.servers[0].requests.filter((r) => r.method === 'thread/loaded/list'),
    ).toHaveLength(2)
    expect(env.killJournal).toEqual([])
    env.registry.stopAll()
  })

  it.each(['malformed', 'repeated-cursor', 'unknown-status'])(
    'refuses an uncertain runtime witness (%s)',
    async (kind) => {
      const env = createEnvironment({
        serverOptions: {
          onRequest: (message) => {
            if (message.method === 'thread/loaded/list')
              return kind === 'malformed'
                ? {}
                : {
                    data: ['target'],
                    nextCursor: kind === 'repeated-cursor' ? 'repeat' : null,
                  }
            if (message.method === 'thread/read')
              return { thread: { status: { type: 'future-status' } } }
          },
        },
      })
      const host = env.registry.get({ account: accountA })
      const connection = await host.connect()
      connection.close()
      await expect(
        host.prepareThreadHandoff('target', 'Account A'),
      ).rejects.toThrow()
      expect(env.killJournal).toEqual([])
      env.registry.stopAll()
    },
  )

  it('a helper exchange holds its account lease until it finishes', async () => {
    const env = createEnvironment()
    const host = env.registry.get({ account: accountA })
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const helper = host.run(async () => {
      entered()
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })
    await started
    await expect(host.withStoppedServer(async () => {})).rejects.toThrow(
      /running a turn/,
    )
    release()
    await helper
    await host.withStoppedServer(async () => {})
    expect(
      env.children[0].exitCode !== null || env.children[0].signalCode !== null,
    ).toBe(true)
    env.registry.stopAll()
  })

  it('retiring one account leaves another live connection and server untouched', async () => {
    const env = createEnvironment()
    const a = env.registry.get({ account: accountA })
    const aConnection = await a.connect()
    aConnection.close()
    const b = env.registry.get({ account: accountB })
    const bConnection = await b.connect()
    await env.registry.withStoppedServer(
      { account: accountA },
      async () => {},
      { retire: true },
    )
    await expect(a.connect()).rejects.toThrow(/retired/)
    expect(env.registry.get({ account: accountA })).not.toBe(a)
    expect(env.children[1].exitCode).toBeNull()
    await expect(
      bConnection.rpc.request('model/list', {}),
    ).resolves.toBeDefined()
    bConnection.close()
    env.registry.stopAll()
  })

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

  it('answers the warm-up question without minting or spawning anything — answer through get() turns red', async () => {
    // The pill asks this on a timer (MAR-2825). A read that spawns what it is
    // asking about would make the question its own cause, and would spawn a
    // second app-server under an account nobody had opened a session on.
    const env = createEnvironment()

    // Asked on a timer by the usage pill, including before Codex is detected
    // at all — where `get` throws "Codex CLI was not detected."
    expect(
      new CodexServerHostRegistry({}).isWarmingUp({ account: accountA }),
    ).toBe(false)
    expect(env.registry.isWarmingUp({ account: accountA })).toBe(false)
    expect(env.children).toHaveLength(0)

    const connecting = env.registry.get({ account: accountA }).connect()
    expect(env.registry.isWarmingUp({ account: accountA })).toBe(true)
    expect(env.registry.isWarmingUp({ account: accountB })).toBe(false)

    const connection = await connecting
    expect(env.registry.isWarmingUp({ account: accountA })).toBe(false)
    connection.close()
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
    let refuseHandshake = true
    const env = createEnvironment({
      serverOptions: {
        onRequest: (message) => {
          if (message.method !== 'initialize' || !refuseHandshake)
            return undefined
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
    refuseHandshake = false
    await host.withStoppedServer(async () => {})
    expect(
      env.children[0].exitCode !== null || env.children[0].signalCode !== null,
    ).toBe(true)
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
