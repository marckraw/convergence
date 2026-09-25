import { MeterProcessSource } from '../../agent-meter/process-source'
import { HandoffRefusedError } from '../provider-account-handoff.pure'
import {
  isCodexThreadRuntimeIdle,
  readCodexLoadedThreadPage,
} from './codex-handoff.pure'
import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnOptions,
} from 'child_process'
import {
  buildCodexAccountEnv,
  type CodexAccountEnvTarget,
} from '../../provider-account/provider-account-codex-env.pure'
import { createRingBuffer } from '../../terminal/ring-buffer.pure'
import type { RingBuffer } from '../../terminal/terminal.types'
import { buildCodexClientInfo } from './codex-client-info.pure'
import { JsonRpcClient, type JsonRpcTransport } from './jsonrpc'
import { connectCodexWebSocket } from './codex-ws-transport'
import {
  buildCodexReadyUrl,
  buildCodexServerObituary,
  buildCodexVersionRefusal,
  codexServerKey,
  collectDescendantPids,
  parseCodexListeningUrl,
  parseProcessTable,
  supportsResidentCodexServer,
  type ProcessTableRow,
} from './codex-server-host.pure'

export type CodexAppServerSpawn = (
  binaryPath: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess

/**
 * How long the server has to bind its port and answer `/readyz`.
 *
 * Measured on this machine 2026-09-05 against the shared, damaged `~/.codex`
 * state: 22.5s to print the listening line, 37ms more to answer `/readyz`
 * (against a healthy `sqlite_home` the same start is 69ms — constitution A1).
 * The budget is patient because the cost is paid once per app launch, off the
 * turn path; a server that reaches it is not slow, it is stuck.
 */
export const CODEX_SERVER_START_BUDGET_MS = 90_000

const CODEX_READY_POLL_INTERVAL_MS = 200

/** How long a server gets to honour SIGTERM on quit before SIGKILL. */
const CODEX_SERVER_KILL_ESCALATION_MS = 3_000

/**
 * How much of the server's stderr we keep to quote in its obituary. A Rust
 * panic plus backtrace fits comfortably (MAR-2317).
 */
const CODEX_SERVER_STDERR_TAIL_BYTES = 8 * 1024

export interface CodexServerObituary {
  key: string
  generation: number
  code: number | null
  signal: string | null
  stderrTail: string
  /** The sentence a session shows when its server died underneath it. */
  note: string
}

export interface CodexServerConnectionOptions {
  /** Conversation-owned state; helpers without an owner stay busy until close. */
  owner?: { isBusy(): boolean; endIdle(): void }
  onTransportFailure?: (error: Error) => void
  isProgressNotification?: (method: string, params: unknown) => boolean
}

export interface CodexServerConnection {
  rpc: JsonRpcClient
  /**
   * Which server process this connection belongs to.
   *
   * A connection outlives nothing: when the generation the session holds is no
   * longer the host's, the session is talking to a process that has died, and
   * it must resume its thread rather than assume the server remembers it.
   */
  generation: number
  close(): void
}

export interface CodexServerHostOptions {
  key: string
  binaryPath: string
  version: string | null
  account: CodexAccountEnvTarget | null
  appVersion: string | null
  cwd: string
  spawnProcess?: CodexAppServerSpawn
  connectTransport?: (url: string) => Promise<JsonRpcTransport>
  probeReady?: (readyUrl: string, signal?: AbortSignal) => Promise<boolean>
  listProcesses?: () => ProcessTableRow[]
  killPid?: (pid: number, signal: NodeJS.Signals) => void
  startBudgetMs?: number
  readyPollIntervalMs?: number
  waitForAdmission?: () => Promise<void> | undefined
}

interface RunningServer {
  child: ChildProcess
  url: string
  generation: number
  stderrTail: RingBuffer
}

/**
 * The process table, read the way the live canary reads it.
 *
 * Synchronous on purpose: the only caller is app quit, which has nothing left
 * to do but leave, and an async read would race the process exiting.
 */
function defaultListProcesses(): ProcessTableRow[] {
  const output = spawnSync('ps', ['-Ao', 'pid,ppid'], { encoding: 'utf8' })
  return parseProcessTable(output.stdout ?? '')
}

function defaultKillPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal)
  } catch {
    // A pid from a `ps` snapshot may already be gone by the time we signal it;
    // that is the outcome we wanted, not a failure to report.
  }
}

async function defaultProbeReady(
  readyUrl: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    // No `Origin` header, ever: the server answers 403 to a probe that carries
    // one (constitution A3), which would read as "never became ready".
    //
    // The signal is the half that makes the start budget real: a listener that
    // accepts the connection and never answers leaves `fetch` pending forever,
    // and an unbounded await cannot be checked against a deadline (F7).
    const response = await fetch(readyUrl, { signal })
    return response.status === 200
  } catch {
    return false
  }
}

/**
 * @pattern Resource pool + single-flight factory.
 *
 * One `codex app-server` per (execution host, Codex home), shared by every
 * session, the quota reader, capability discovery and skill listing on that
 * account. The boundary exists because the process is a *scarce, colliding*
 * resource, not merely an expensive one: two app-servers initialising at once
 * under one `CODEX_HOME` kill the second (measured 3/3), and Convergence used
 * to spawn one per turn. Everything a caller can do here goes through
 * `connect()`, so there is no second way to reach the binary and therefore no
 * way back to a per-turn spawn.
 */
export class CodexServerHost {
  readonly key: string
  private server: RunningServer | null = null
  /**
   * The child of the start in flight, held from `spawn` until the host either
   * adopts it as `server` or has watched it exit.
   *
   * Without it `stop()` could only see a *ready* server, so a quit during the
   * cold start — up to 90s of it — left the process running with nobody left to
   * signal it, and a failed start handed the next caller a licence to spawn a
   * second app-server under the same `CODEX_HOME` while the first was still
   * alive: the exact collision the resident design exists to remove
   * (MAR-2823 F3).
   */
  private spawning: ChildProcess | null = null
  private starting: Promise<RunningServer> | null = null
  private stopped = false
  private retired = false
  private retiring: ChildProcess | null = null
  private connectionLeases = new Set<{ isBusy(): boolean; endIdle(): void }>()
  private maintaining: Promise<void> | null = null
  private generationCounter = 0
  private deathListeners = new Set<(obituary: CodexServerObituary) => void>()
  private readonly spawnProcess: CodexAppServerSpawn
  private readonly connectTransport: (url: string) => Promise<JsonRpcTransport>
  private readonly possiblyLiveThreads = new Map<
    string,
    {
      generation: number
      turnId?: string | null
      clientUserMessageId?: string | null
    }
  >()

  /** A lost transport is not evidence that its server-side turn finished. */
  rememberPossiblyLiveThread(
    threadId: string,
    generation: number,
    detail: {
      turnId?: string | null
      clientUserMessageId?: string | null
    } = {},
  ): void {
    if (this.server?.generation !== generation) return
    this.possiblyLiveThreads.set(threadId, { generation, ...detail })
  }

  observeThreadSettled(threadId: string, generation: number): void {
    if (this.possiblyLiveThreads.get(threadId)?.generation === generation)
      this.possiblyLiveThreads.delete(threadId)
  }

  private readonly probeReady: (
    readyUrl: string,
    signal?: AbortSignal,
  ) => Promise<boolean>
  private readonly listProcesses: () => ProcessTableRow[]
  private readonly killPid: (pid: number, signal: NodeJS.Signals) => void
  private readonly startBudgetMs: number
  private readonly readyPollIntervalMs: number

  readonly processMeter: MeterProcessSource

  constructor(private readonly options: CodexServerHostOptions) {
    this.processMeter = new MeterProcessSource(
      options.account?.label ?? 'Default account',
    )
    this.key = options.key
    this.spawnProcess = options.spawnProcess ?? spawn
    this.connectTransport =
      options.connectTransport ?? ((url) => connectCodexWebSocket(url))
    this.probeReady = options.probeReady ?? defaultProbeReady
    this.listProcesses = options.listProcesses ?? defaultListProcesses
    this.killPid = options.killPid ?? defaultKillPid
    this.startBudgetMs = options.startBudgetMs ?? CODEX_SERVER_START_BUDGET_MS
    this.readyPollIntervalMs =
      options.readyPollIntervalMs ?? CODEX_READY_POLL_INTERVAL_MS
  }

  hasGeneration(generation: number): boolean {
    return this.server?.generation === generation
  }

  /** True once a server is up; false while it is warming up or after a death. */
  isReady(): boolean {
    return this.server !== null
  }

  /**
   * Where the running server listens, or null while there is none.
   *
   * Diagnostic: it is what a bug report or the live canary needs in order to
   * say *which* process it is talking about.
   */
  address(): { url: string; readyUrl: string | null } | null {
    if (!this.server) return null
    return {
      url: this.server.url,
      readyUrl: buildCodexReadyUrl(this.server.url),
    }
  }

  /** True while a start is under way — the "Codex is starting…" state. */
  isWarmingUp(): boolean {
    return this.starting !== null
  }

  onDeath(listener: (obituary: CodexServerObituary) => void): () => void {
    this.deathListeners.add(listener)
    return () => {
      this.deathListeners.delete(listener)
    }
  }

  /**
   * Opens one connection to the resident server, starting it if needed.
   *
   * Concurrent callers share the single start in flight: that sharing is the
   * invariant the whole design rests on, so it lives here rather than in any
   * caller.
   */
  async connect(
    options: CodexServerConnectionOptions = {},
  ): Promise<CodexServerConnection> {
    // Re-read both gates after every wake: another maintenance window may
    // have opened before this continuation was scheduled.
    for (;;) {
      const admission = this.options.waitForAdmission?.() ?? this.maintaining
      if (!admission) break
      await admission
    }
    if (this.retired)
      throw new Error('This Codex account server has been retired.')
    return this.connectAdmitted(options, true)
  }

  /** The maintenance witness has its own control socket, never a work lease. */
  private async connectAdmitted(
    options: CodexServerConnectionOptions,
    counted: boolean,
  ): Promise<CodexServerConnection> {
    // Admission is synchronous, before startup, socket connection or initialize
    // can yield. Helpers and warming connections count just like live turns.
    let initialized = false
    const lease = {
      isBusy: () => !initialized || !options.owner || options.owner.isBusy(),
      endIdle: () => {
        options.owner?.endIdle()
        close()
      },
    }
    if (counted) this.connectionLeases.add(lease)
    let released = false
    let rpc: JsonRpcClient | undefined
    const release = () => {
      if (released) return
      released = true
      if (counted) this.connectionLeases.delete(lease)
    }
    const close = () => {
      rpc?.destroy()
      release()
    }
    try {
      const server = await this.ensureServer()
      const transport = await this.connectTransport(server.url)
      rpc = new JsonRpcClient(transport, {
        onTransportFailure: (error) => {
          close()
          options.onTransportFailure?.(error)
        },
        isProgressNotification: options.isProgressNotification,
      })
      await rpc.request('initialize', {
        clientInfo: buildCodexClientInfo(this.options.appVersion),
        capabilities: { experimentalApi: true },
      })
      rpc.notify('initialized')
      initialized = true
      return { rpc, generation: server.generation, close }
    } catch (err) {
      // The socket is open and nobody else holds it: a handshake that rejects
      // leaves the caller with an error and the server with a live connection
      // per attempt, since the process this one belongs to is resident and
      // outlives every failure.
      close()
      throw err
    }
  }

  /**
   * @pattern Exclusive resource lease.
   *
   * Reconnect/removal may change credentials only after the old process exits.
   * The gate remains closed throughout that operation, so a quota helper or
   * connecting turn cannot enter between the idle check and credential write.
   * The host stays stable for existing callers; its next connection starts a
   * fresh process unless the account has been permanently retired.
   */
  async withStoppedServer<T>(
    work: () => Promise<T>,
    options: {
      retire?: boolean
      handoff?: {
        threadId: string
        accountLabel: string
        role?: 'source' | 'destination'
      }
    } = {},
  ): Promise<T> {
    if (this.stopped) throw new Error('This Codex account server is stopped.')
    if (this.maintaining)
      throw new Error('This Codex account is undergoing maintenance.')
    if (!options.handoff && this.hasBusyOwner()) {
      throw new Error(
        'This Codex account is running a turn. Try again when it finishes.',
      )
    }
    let release!: () => void
    const admission = new Promise<void>((resolve) => {
      release = resolve
    })
    // Closed before the witness's first await, including warming helpers.
    this.maintaining = admission
    let mutating = false
    try {
      let restart = true
      let control: CodexServerConnection | null = null
      try {
        // A cold host has no in-memory conversation to refresh. Do not spawn
        // merely to prove that it has no work.
        if (this.server || this.starting) {
          control = await this.connectAdmitted(
            { isProgressNotification: () => false },
            false,
          )
          for (const [id, marker] of this.possiblyLiveThreads) {
            if (marker.generation !== control.generation) {
              this.possiblyLiveThreads.delete(id)
              continue
            }
            const idle = isCodexThreadRuntimeIdle(
              await control.rpc.request('thread/read', {
                threadId: id,
                includeTurns: false,
              }),
            )
            if (idle) this.observeThreadSettled(id, control.generation)
            else if (
              options.handoff?.role === 'source' &&
              options.handoff.threadId === id
            ) {
              throw new HandoffRefusedError(
                'not-eligible',
                `This conversation's last turn may still be running on ${options.handoff.accountLabel}'s server; wait for it to settle or reconnect. Your message was not sent.`,
              )
            }
          }
          const loaded = await this.loadedThreads(control.rpc)
          restart =
            !options.handoff || loaded.includes(options.handoff.threadId)
          if (restart) {
            const busy =
              (options.handoff && this.connectionLeases.size > 0) ||
              this.possiblyLiveThreads.size > 0 ||
              !(await this.allThreadsIdle(control.rpc, loaded))
            if (busy) {
              if (options.handoff)
                throw new HandoffRefusedError(
                  'busy',
                  `${options.handoff.accountLabel}'s server is busy with another conversation; try again when it settles. Your message was not sent.`,
                )
              throw new Error(
                'This Codex account is running a turn. Try again when it finishes.',
              )
            }
          }
        } else if (options.handoff) restart = false
      } finally {
        control?.close()
      }
      if (restart) {
        if (!options.handoff) {
          // The witness awaited the server: an existing owner may have accepted
          // a send meanwhile. Recheck and evict in one synchronous step.
          if (this.hasBusyOwner())
            throw new Error(
              'This Codex account is running a turn. Try again when it finishes.',
            )
          for (const lease of this.connectionLeases) lease.endIdle()
        }
        mutating = true
        const running = this.server
        this.server = null
        this.possiblyLiveThreads.clear()
        if (running) {
          this.retiring = running.child
          try {
            await this.terminateChild(running.child)
          } finally {
            this.retiring = null
          }
        }
      }
      if (this.stopped) throw new Error('This Codex account server is stopped.')
      mutating = true
      const result = await work()
      if (options.retire) {
        this.retired = true
        this.stopped = true
      }
      return result
    } catch (error) {
      // The maintenance result belongs to its caller. Waiting sends re-enter
      // after either refusal or failed work, using the surviving or new server.
      if (options.handoff && !mutating) {
        throw error instanceof HandoffRefusedError
          ? error
          : new HandoffRefusedError(
              'not-eligible',
              `${options.handoff.accountLabel}: ${error instanceof Error ? error.message : String(error)} Your message was not sent.`,
            )
      }
      throw error
    } finally {
      this.maintaining = null
      release()
    }
  }

  private hasBusyOwner(): boolean {
    return [...this.connectionLeases].some((lease) => lease.isBusy())
  }

  async prepareThreadHandoff(
    threadId: string,
    accountLabel: string,
  ): Promise<void> {
    try {
      await this.withStoppedServer(async () => {}, {
        handoff: { threadId, accountLabel },
      })
    } catch (error) {
      if (error instanceof HandoffRefusedError) throw error
      throw new HandoffRefusedError(
        'not-eligible',
        `${accountLabel}: ${error instanceof Error ? error.message : String(error)} Your message was not sent.`,
      )
    }
  }

  private async loadedThreads(rpc: JsonRpcClient): Promise<string[]> {
    const ids = new Set<string>()
    const cursors = new Set<string>()
    let cursor: string | null = null
    do {
      const page = readCodexLoadedThreadPage(
        await rpc.request('thread/loaded/list', {
          ...(cursor ? { cursor } : {}),
          limit: 100,
        }),
      )
      for (const id of page.ids) ids.add(id)
      cursor = page.nextCursor
      if (cursor) {
        if (cursors.has(cursor))
          throw new Error(
            'Codex repeated its loaded-conversation cursor; account handoff was not attempted.',
          )
        cursors.add(cursor)
      }
    } while (cursor)
    return [...ids]
  }

  private async allThreadsIdle(
    rpc: JsonRpcClient,
    ids: string[],
  ): Promise<boolean> {
    for (const threadId of ids) {
      if (
        !isCodexThreadRuntimeIdle(
          await rpc.request('thread/read', { threadId, includeTurns: false }),
        )
      )
        return false
    }
    return true
  }

  /**
   * Runs one short exchange on its own connection and closes it.
   *
   * Quota, capability discovery and skill listing are all this shape: they need
   * the server, never a thread, and must not share a live turn's pipe.
   */
  async run<T>(work: (rpc: JsonRpcClient) => Promise<T>): Promise<T> {
    const connection = await this.connect({
      // A threadless request's only progress is its own response. Every
      // notification on this socket belongs to some session's thread, and
      // counting a stranger's broadcast as progress is how a genuinely stuck
      // `model/list` stays pending for as long as the machine stays busy
      // (constitution A5, MAR-2823 F6).
      isProgressNotification: () => false,
    })
    try {
      return await work(connection.rpc)
    } finally {
      connection.close()
    }
  }

  /**
   * App quit or binary replacement. Signals now; callers that mutate account
   * storage can also await the observed exit of every owned child.
   *
   * Both children are signalled: the ready one and the one still warming up.
   * `server` is only assigned after `/readyz` answers, so a quit inside the
   * cold start used to find nothing to stop and left the process behind
   * (MAR-2823 F3).
   */
  stop(): Promise<void> {
    this.stopped = true
    const running = this.server
    const spawning = this.spawning
    this.server = null
    this.possiblyLiveThreads.clear()
    this.spawning = null
    this.starting = null
    const exits: Promise<void>[] = []
    for (const child of new Set([running?.child, spawning, this.retiring])) {
      if (!child) continue
      if (child.exitCode === null && child.signalCode === null) {
        exits.push(
          new Promise<void>((resolve) => child.once('exit', () => resolve())),
        )
      }
      this.signalWithEscalation(child)
    }
    return Promise.all(exits).then(() => {})
  }

  /**
   * SIGTERM now, the whole tree in 3s if it is still there.
   *
   * Quit does not wait for a server to feel like leaving. A process wedged on
   * its own state takes SIGTERM and stays; the per-session runtime escalated
   * after 3s, and dropping that escalation is how a resident server outlives
   * the app that spawned it.
   */
  private signalWithEscalation(child: ChildProcess): void {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGTERM')
    const escalation = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) return
      this.killTree(child)
    }, CODEX_SERVER_KILL_ESCALATION_MS)
    escalation.unref?.()
  }

  /**
   * Sees a child out and resolves only once its exit has been observed.
   *
   * This is the half that serialises replacement: a start that failed has not
   * released its `CODEX_HOME` until the process is gone, so the host must not
   * hand the next caller a fresh spawn before then (MAR-2823 F3).
   */
  private terminateChild(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      let settled = false
      let escalation: ReturnType<typeof setTimeout> | null = null
      const finish = () => {
        if (settled) return
        settled = true
        if (escalation) clearTimeout(escalation)
        resolve()
      }

      child.once('exit', finish)
      child.kill('SIGTERM')
      if (settled) return

      escalation = setTimeout(() => {
        this.killTree(child)
      }, CODEX_SERVER_KILL_ESCALATION_MS)
      escalation.unref?.()
    })
  }

  /**
   * SIGKILLs the shim's descendants, deepest first, and only then the shim.
   *
   * The process we spawn is never the process that holds the port: `codex` on
   * npm is a Node shim that execs the vendored Rust binary. The shim forwards
   * SIGTERM (measured: shim exits 0 and the Rust child is gone inside 200ms),
   * but **SIGKILL cannot be forwarded** — so killing the shim alone on a wedged
   * server orphans the grandchild in exactly the case the escalation exists for
   * (MAR-2823 L2'). The tree is found by parentage rather than by making the
   * spawn detached: a detached server would survive Ctrl-C in `npm run dev` and
   * orphan itself on every dev restart, which is the worse trade.
   */
  private killTree(child: ChildProcess): void {
    const pid = child.pid
    if (typeof pid === 'number') {
      for (const descendant of collectDescendantPids(
        this.listProcesses(),
        pid,
      )) {
        this.killPid(descendant, 'SIGKILL')
      }
    }
    child.kill('SIGKILL')
  }

  private ensureServer(): Promise<RunningServer> {
    if (this.stopped) {
      return Promise.reject(new Error('Convergence is shutting down.'))
    }
    if (this.server) return Promise.resolve(this.server)
    if (this.starting) return this.starting

    const starting = this.startServer()
      .then(async (server) => {
        // A stop that lands mid-start must not leave a process behind — and
        // "not behind" means watched out, not merely signalled.
        if (this.stopped) {
          await this.terminateChild(server.child)
          throw new Error('Convergence is shutting down.')
        }
        this.spawning = null
        this.server = server
        this.starting = null
        return server
      })
      .catch((err) => {
        // `startServer` has already seen its child out by the time it rejects,
        // so releasing the single-flight slot here cannot let a second server
        // start beside a live one.
        this.spawning = null
        this.starting = null
        throw err
      })

    this.starting = starting
    return starting
  }

  private async startServer(): Promise<RunningServer> {
    if (!supportsResidentCodexServer(this.options.version)) {
      throw new Error(buildCodexVersionRefusal(this.options.version))
    }

    // One deadline for the whole start, not one per phase: port discovery and
    // readiness used to get a full budget each, so a server that crawled
    // through both took twice as long as the number the failure quotes (F7).
    const deadline = Date.now() + this.startBudgetMs
    const generation = ++this.generationCounter
    const stderrTail = createRingBuffer(CODEX_SERVER_STDERR_TAIL_BYTES)
    const child = this.spawnProcess(
      this.options.binaryPath,
      ['app-server', '--listen', 'ws://127.0.0.1:0'],
      {
        cwd: this.options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: buildCodexAccountEnv({
          baseEnv: process.env,
          account: this.options.account,
        }),
      },
    )
    this.processMeter.bind(child)
    this.spawning = child

    // A death during the start is an answer to both phases below, so it is
    // recorded once, here, and read by each of them.
    let startFailure: Error | null = null
    let onStartFailure: (() => void) | null = null
    const failStart = (error: Error) => {
      startFailure ??= error
      onStartFailure?.()
    }
    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
      failStart(
        new Error(
          buildCodexServerObituary({
            code,
            signal,
            stderrTail: stderrTail.snapshot(),
          }),
        ),
      )
    }
    const handleError = (err: Error) => failStart(err)
    child.once('exit', handleExit)
    child.once('error', handleError)

    let listeningUrl: string | null = null
    let onListening: ((url: string) => void) | null = null
    let stderrText = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrTail.append(text)
      if (listeningUrl) return
      stderrText += text
      const parsed = parseCodexListeningUrl(stderrText)
      if (parsed) {
        listeningUrl = parsed
        onListening?.(parsed)
      }
    })

    try {
      const url = await new Promise<string>((resolve, reject) => {
        const settleFailure = () => {
          if (startFailure) reject(startFailure)
        }
        if (startFailure) {
          reject(startFailure)
          return
        }
        if (listeningUrl) {
          resolve(listeningUrl)
          return
        }

        const timer = setTimeout(
          () => {
            reject(
              new Error(
                this.startTimeoutMessage(
                  'never reported a listening port',
                  stderrTail.snapshot(),
                ),
              ),
            )
          },
          Math.max(0, deadline - Date.now()),
        )
        timer.unref?.()

        onStartFailure = () => {
          clearTimeout(timer)
          settleFailure()
        }
        onListening = (value) => {
          clearTimeout(timer)
          resolve(value)
        }
      })

      const readyUrl = buildCodexReadyUrl(url)
      if (!readyUrl) {
        throw new Error(
          `The Codex app-server reported an unusable listener address (${url}).`,
        )
      }

      onStartFailure = null
      await this.awaitReady(readyUrl, deadline, () => startFailure, stderrTail)

      child.off('exit', handleExit)
      child.off('error', handleError)
      const running: RunningServer = { child, url, generation, stderrTail }
      this.watchForDeath(running)
      return running
    } catch (err) {
      onStartFailure = null
      onListening = null
      // The host owns this child until it is gone: rejecting while it is still
      // alive is what let the next `connect()` spawn a second app-server under
      // the same home (MAR-2823 F3).
      await this.terminateChild(child)
      throw err
    }
  }

  private budgetSeconds(): number {
    return Math.round(this.startBudgetMs / 1000)
  }

  /**
   * A start timeout, in the process's own words where it has any.
   *
   * Without the tail the two failures a stuck start can produce are
   * indistinguishable from a machine that was merely slow, and the stderr the
   * ring buffer already holds is the only thing that says which (F7).
   */
  private startTimeoutMessage(reason: string, stderrTail: string): string {
    const tail = stderrTail.trim()
    return (
      `The Codex app-server ${reason} within ${this.budgetSeconds()}s.` +
      (tail ? ` Its last words: ${tail}` : '')
    )
  }

  /**
   * Polls `/readyz` until it answers 200, the server dies, or the shared start
   * deadline runs out. Readiness is observed, never assumed — a constitution
   * law.
   *
   * Each probe is bounded twice over: the signal aborts a `fetch` the listener
   * accepted and never answered, and the race bounds the await itself, so a
   * probe that ignores its signal cannot hold the deadline open either (F7).
   */
  private async awaitReady(
    readyUrl: string,
    deadline: number,
    readStartFailure: () => Error | null,
    stderrTail: RingBuffer,
  ): Promise<void> {
    for (;;) {
      const failure = readStartFailure()
      if (failure) throw failure

      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new Error(
          this.startTimeoutMessage(
            'did not become ready',
            stderrTail.snapshot(),
          ),
        )
      }

      const ready = await this.probeWithin(readyUrl, remaining)

      // Re-read after the await: the server can die while the probe is in
      // flight, and reporting a timeout then would hide its own explanation.
      const failureAfterProbe = readStartFailure()
      if (failureAfterProbe) throw failureAfterProbe
      if (ready) return

      if (Date.now() >= deadline) {
        throw new Error(
          this.startTimeoutMessage(
            'did not become ready',
            stderrTail.snapshot(),
          ),
        )
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(this.readyPollIntervalMs, remaining)),
      )
    }
  }

  private probeWithin(readyUrl: string, remainingMs: number): Promise<boolean> {
    const controller = new AbortController()
    const abort = setTimeout(() => controller.abort(), remainingMs)
    abort.unref?.()

    return new Promise<boolean>((resolve) => {
      let settled = false
      const settle = (ready: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(abort)
        clearTimeout(bound)
        resolve(ready)
      }
      const bound = setTimeout(() => settle(false), remainingMs)
      bound.unref?.()

      void Promise.resolve(this.probeReady(readyUrl, controller.signal)).then(
        (ready) => settle(ready === true),
        () => settle(false),
      )
    })
  }

  private watchForDeath(running: RunningServer): void {
    running.child.once(
      'exit',
      (code: number | null, signal: NodeJS.Signals | null) => {
        if (this.server !== running) return
        this.server = null
        this.possiblyLiveThreads.clear()
        const obituary: CodexServerObituary = {
          key: this.key,
          generation: running.generation,
          code,
          signal,
          stderrTail: running.stderrTail.snapshot(),
          note: buildCodexServerObituary({
            code,
            signal,
            stderrTail: running.stderrTail.snapshot(),
          }),
        }
        for (const listener of [...this.deathListeners]) {
          listener(obituary)
        }
      },
    )
  }
}

export interface CodexServerHostRegistryOptions {
  appVersion?: string | null
  cwd?: string
  spawnProcess?: CodexAppServerSpawn
  connectTransport?: (url: string) => Promise<JsonRpcTransport>
  probeReady?: (readyUrl: string, signal?: AbortSignal) => Promise<boolean>
  listProcesses?: () => ProcessTableRow[]
  killPid?: (pid: number, signal: NodeJS.Signals) => void
}

/**
 * @pattern Registry (keyed singleton factory).
 *
 * The app's single door to `codex app-server` processes. It exists so that the
 * provider, the quota reader and skill discovery cannot each hold their own
 * server: they hold the same one, by key, for the app's life.
 */
export class CodexServerHostRegistry {
  private binaryPath: string | null = null
  private version: string | null = null
  private readonly hosts = new Map<string, CodexServerHost>()
  private readonly maintainingKeys = new Map<string, Promise<void>>()
  private readonly stopping = new Map<string, Promise<void>>()

  constructor(private readonly options: CodexServerHostRegistryOptions = {}) {}

  /** Provider detection runs after construction, so the path arrives later. */
  setBinary(binaryPath: string | null, version: string | null): void {
    if (binaryPath === this.binaryPath && version === this.version) return
    // A different binary is a different server: stop what the old one owns
    // rather than keep talking to a process from an uninstalled version.
    this.stopAll()
    this.binaryPath = binaryPath
    this.version = version
  }

  hasBinary(): boolean {
    return this.binaryPath !== null
  }

  get(input: {
    executionHostId?: string | null
    account: CodexAccountEnvTarget | null
  }): CodexServerHost {
    if (!this.binaryPath) {
      throw new Error('Codex CLI was not detected.')
    }

    const key = codexServerKey({
      executionHostId: input.executionHostId ?? 'local',
      codexHome: input.account?.configDir ?? null,
    })
    const existing = this.hosts.get(key)
    if (existing) return existing

    const host = new CodexServerHost({
      key,
      binaryPath: this.binaryPath,
      version: this.version,
      account: input.account,
      appVersion: this.options.appVersion ?? null,
      cwd: this.options.cwd ?? process.cwd(),
      spawnProcess: this.options.spawnProcess,
      connectTransport: this.options.connectTransport,
      probeReady: this.options.probeReady,
      listProcesses: this.options.listProcesses,
      killPid: this.options.killPid,
      waitForAdmission: () => this.maintainingKeys.get(key),
    })
    this.hosts.set(key, host)
    return host
  }

  /** Keeps account admission closed even if provider detection replaces the pool. */
  async withStoppedServer<T>(
    input: {
      executionHostId?: string | null
      account: CodexAccountEnvTarget | null
    },
    work: () => Promise<T>,
    options: {
      retire?: boolean
      handoff?: {
        threadId: string
        accountLabel: string
        role?: 'source' | 'destination'
      }
    } = {},
  ): Promise<T> {
    const key = codexServerKey({
      executionHostId: input.executionHostId ?? 'local',
      codexHome: input.account?.configDir ?? null,
    })
    if (this.maintainingKeys.has(key)) {
      throw new Error('This Codex account is undergoing maintenance.')
    }
    const host =
      this.hosts.get(key) ?? (this.binaryPath ? this.get(input) : null)
    let release!: () => void
    const admission = new Promise<void>((resolve) => {
      release = resolve
    })
    this.maintainingKeys.set(key, admission)
    try {
      // Detection may already have removed an old host from `hosts`. Its
      // credential home remains occupied until the process actually exits.
      await this.stopping.get(key)
      const result = host
        ? await host.withStoppedServer(work, options)
        : await work()
      if (options.retire && this.hosts.get(key) === host) {
        this.hosts.delete(key)
      }
      return result
    } finally {
      this.maintainingKeys.delete(key)
      release()
    }
  }

  async prepareThreadHandoff(input: {
    executionHostId?: string | null
    account: CodexAccountEnvTarget | null
    threadId: string
    role?: 'source' | 'destination'
    accountLabel: string
    /** Source lookup must never create a server merely to release it. */
    existingOnly?: boolean
  }): Promise<void> {
    try {
      if (input.existingOnly) {
        const key = codexServerKey({
          executionHostId: input.executionHostId ?? 'local',
          codexHome: input.account?.configDir ?? null,
        })
        await this.stopping.get(key)
        if (!this.hosts.has(key)) return
      }
      await this.withStoppedServer(input, async () => {}, {
        handoff: {
          threadId: input.threadId,
          accountLabel: input.accountLabel,
          role: input.role,
        },
      })
    } catch (error) {
      if (error instanceof HandoffRefusedError) {
        if (input.role === 'source' && error.stage === 'busy') {
          throw new HandoffRefusedError(
            'source-busy',
            `${input.accountLabel}'s server still holds this conversation and is busy with other work; try again when it settles. Your message was not sent.`,
          )
        }
        throw error
      }
      throw new HandoffRefusedError(
        'not-eligible',
        `${input.accountLabel}: ${error instanceof Error ? error.message : String(error)} Your message was not sent.`,
      )
    }
  }

  /**
   * Whether the server for this scope is starting up right now.
   *
   * A pure read of what exists: a scope with no host has nothing warming. It
   * deliberately does not go through `get`, which mints a host and *throws*
   * when no Codex binary has been detected — this question is asked on a timer
   * by the usage pill (MAR-2825), long before and long after any session, and a
   * question that can throw is one every caller has to wrap.
   */
  isWarmingUp(input: {
    executionHostId?: string | null
    account: CodexAccountEnvTarget | null
  }): boolean {
    const key = codexServerKey({
      executionHostId: input.executionHostId ?? 'local',
      codexHome: input.account?.configDir ?? null,
    })
    return this.hosts.get(key)?.isWarmingUp() ?? false
  }

  stopAll(): void {
    for (const [key, host] of this.hosts) {
      const stopped = Promise.all([this.stopping.get(key), host.stop()]).then(
        () => {},
      )
      this.stopping.set(key, stopped)
      void stopped.then(() => {
        if (this.stopping.get(key) === stopped) this.stopping.delete(key)
      })
    }
    this.hosts.clear()
  }
}
