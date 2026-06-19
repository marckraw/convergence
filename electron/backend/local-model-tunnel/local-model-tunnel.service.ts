import { randomUUID } from 'crypto'
import { execFile, spawn, type ChildProcess } from 'child_process'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { connect } from 'net'
import type { StateService } from '../state/state.service'
import {
  applyLocalModelTunnelProfileInput,
  buildDefaultLocalModelTunnelProfile,
  buildLocalModelTunnelCommand,
  getEffectiveLocalBindHost,
  getEffectiveRouteLocalBindHost,
  getLocalModelTunnelRoutes,
  getRouteEffectiveHealthCheckUrl,
  LOCAL_MODEL_TUNNEL_PROFILES_KEY,
  parseLocalModelTunnelProfiles,
} from './local-model-tunnel.pure'
import type {
  LocalModelTunnelCommand,
  LocalModelTunnelDiagnostic,
  LocalModelTunnelEventEmitter,
  LocalModelTunnelHealthFailureKind,
  LocalModelTunnelHealthStatus,
  LocalModelTunnelProfile,
  LocalModelTunnelProfileInput,
  LocalModelTunnelRouteCandidate,
  LocalModelTunnelRuntimeStatus,
  LocalModelTunnelSnapshot,
} from './local-model-tunnel.types'

type SpawnTunnel = (binary: string, args: string[]) => ChildProcess

const STARTUP_PROBE_ATTEMPTS = 12
const STARTUP_PROBE_DELAY_MS = 250
const PROBE_TIMEOUT_MS = 800
const STOP_WAIT_TIMEOUT_MS = 1000
const MONITOR_INTERVAL_MS = 15_000

interface ManagedProcess {
  child: ChildProcess
  stopping: boolean
  stderr: string
  command: LocalModelTunnelCommand
  route: LocalModelTunnelRouteCandidate
  exitPromise: Promise<void>
  resolveExit: () => void
}

interface ProbeResult extends LocalModelTunnelHealthStatus {
  available: boolean
  responding: boolean
}

interface RouteAttemptResult {
  state: 'running' | 'failed' | 'cancelled'
  diagnostics: LocalModelTunnelDiagnostic[]
  error: string | null
}

interface RouteExitResult {
  kind: 'exit' | 'error'
  code: number | null
  signal: NodeJS.Signals | null
  error: Error | null
}

type WaitRouteAttemptResult =
  | { state: 'running'; probe: ProbeResult }
  | {
      state: 'failed'
      probe: ProbeResult
      exit: RouteExitResult | null
      error: string
    }
  | { state: 'cancelled' }

export class LocalModelTunnelService {
  private readonly processes = new Map<string, ManagedProcess>()
  private readonly statuses = new Map<string, LocalModelTunnelRuntimeStatus>()
  private readonly startTokens = new Map<string, symbol>()
  private monitorTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly state: StateService,
    private readonly emit: LocalModelTunnelEventEmitter,
    private readonly spawnTunnel: SpawnTunnel = (binary, args) =>
      spawn(binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      }),
  ) {}

  async getSnapshot(): Promise<LocalModelTunnelSnapshot> {
    await this.refreshMonitoredStatuses()
    return this.buildSnapshot()
  }

  async start(profileId: string): Promise<LocalModelTunnelSnapshot> {
    const profile = this.requireProfile(profileId)
    if (profile.connectionKind === 'local-runtime') {
      await this.refreshProfileStatus(profile)
      return this.broadcast()
    }

    const existing = this.processes.get(profile.id)
    if (existing) {
      this.setStatus(profile, {
        state: 'running',
        managed: true,
        pid: existing.child.pid ?? null,
        error: null,
        activeRouteId: existing.route.id,
        activeRouteLabel: existing.route.label,
      })
      return this.broadcast()
    }

    const initialProbe = await this.probeEndpoint(profile)
    if (initialProbe.responding) {
      if (profile.allowExternal && initialProbe.available) {
        this.setStatus(profile, {
          state: 'external',
          managed: false,
          pid: null,
          error: null,
          health: initialProbe,
          activeRouteId: null,
          activeRouteLabel: 'Endpoint already available',
          diagnostics: [
            {
              label: 'Endpoint',
              value: 'Endpoint already available',
            },
          ],
        })
      } else {
        const portOwner = await inspectLocalPortOwner(profile.localPort)
        this.setStatus(profile, {
          state: 'failed',
          managed: false,
          pid: null,
          error: formatLocalPortConflictError(profile.localPort),
          health: initialProbe,
          diagnostics: buildLocalPortConflictDiagnostics({
            profile,
            portOwner,
            probe: initialProbe,
          }),
        })
      }
      return this.broadcast()
    }

    const localPortProbe =
      profile.healthCheckEnabled && profile.healthCheckUrl
        ? await probeTcp(
            getEffectiveLocalBindHost(profile),
            profile.localPort,
            PROBE_TIMEOUT_MS,
          )
        : initialProbe
    if (localPortProbe.responding) {
      const portOwner = await inspectLocalPortOwner(profile.localPort)
      this.setStatus(profile, {
        state: 'failed',
        managed: false,
        pid: null,
        error: formatLocalPortConflictError(profile.localPort),
        health: initialProbe,
        diagnostics: buildLocalPortConflictDiagnostics({
          profile,
          portOwner,
          probe: initialProbe,
        }),
      })
      return this.broadcast()
    }

    const token = Symbol(profile.id)
    this.startTokens.set(profile.id, token)
    this.setStatus(profile, {
      state: 'starting',
      managed: true,
      pid: null,
      error: null,
      health: initialProbe,
      activeRouteId: null,
      activeRouteLabel: null,
      diagnostics: [],
    })
    void this.broadcast()
    void this.startRouteCandidates(profile, token)
    return this.buildSnapshot()
  }

  async stop(profileId: string): Promise<LocalModelTunnelSnapshot> {
    const profile = this.requireProfile(profileId)
    this.startTokens.delete(profile.id)
    const managed = this.processes.get(profile.id)
    if (!managed) {
      this.setStatus(profile, {
        state: 'stopped',
        managed: false,
        pid: null,
        error: null,
        activeRouteId: null,
        activeRouteLabel: null,
      })
      return this.broadcast()
    }

    managed.stopping = true
    try {
      managed.child.kill('SIGTERM')
    } catch {
      // Process is already gone.
    }
    this.processes.delete(profile.id)
    this.setStatus(profile, {
      state: 'stopped',
      managed: false,
      pid: null,
      error: null,
      activeRouteId: null,
      activeRouteLabel: null,
    })
    return this.broadcast()
  }

  async restart(profileId: string): Promise<LocalModelTunnelSnapshot> {
    const profile = this.requireProfile(profileId)
    const managed = this.processes.get(profile.id)
    await this.stop(profileId)
    if (managed) {
      await Promise.race([managed.exitPromise, delay(STOP_WAIT_TIMEOUT_MS)])
    }
    await delay(STARTUP_PROBE_DELAY_MS)
    return this.start(profileId)
  }

  async startAutoStartProfiles(): Promise<void> {
    const profiles = this.getProfiles()
    for (const profile of profiles) {
      if (profile.autoStart) {
        await this.start(profile.id)
      }
    }
  }

  stopAllManaged(): void {
    for (const [profileId, managed] of this.processes.entries()) {
      managed.stopping = true
      try {
        managed.child.kill('SIGTERM')
      } catch {
        this.processes.delete(profileId)
      }
    }
  }

  async createProfile(
    input: LocalModelTunnelProfileInput,
  ): Promise<LocalModelTunnelSnapshot> {
    const now = new Date().toISOString()
    const base = {
      ...buildDefaultLocalModelTunnelProfile(now),
      id: randomUUID(),
      name: 'New tunnel',
      autoStart: false,
    }
    const profile = applyLocalModelTunnelProfileInput(base, input, now)
    this.saveProfiles([...this.getProfiles(), profile])
    this.statuses.set(profile.id, this.defaultStatus(profile))
    return this.broadcast()
  }

  async updateProfile(
    profileId: string,
    input: LocalModelTunnelProfileInput,
  ): Promise<LocalModelTunnelSnapshot> {
    const profiles = this.getProfiles()
    const wasManaged = this.processes.has(profileId)
    const nextProfiles = profiles.map((profile) =>
      profile.id === profileId
        ? applyLocalModelTunnelProfileInput(profile, input)
        : profile,
    )
    this.saveProfiles(nextProfiles)
    const nextProfile = nextProfiles.find((profile) => profile.id === profileId)
    if (nextProfile) {
      const current = this.getStatus(nextProfile)
      this.statuses.set(nextProfile.id, {
        ...current,
        commandPreview: buildLocalModelTunnelCommand(nextProfile).preview,
      })
      if (wasManaged) {
        return this.restart(nextProfile.id)
      }
    }
    return this.broadcast()
  }

  async deleteProfile(profileId: string): Promise<LocalModelTunnelSnapshot> {
    await this.stop(profileId)
    const remaining = this.getProfiles().filter(
      (profile) => profile.id !== profileId,
    )
    this.statuses.delete(profileId)
    this.saveProfiles(
      remaining.length > 0
        ? remaining
        : [buildDefaultLocalModelTunnelProfile()],
    )
    return this.broadcast()
  }

  private async startRouteCandidates(
    profile: LocalModelTunnelProfile,
    token: symbol,
  ): Promise<void> {
    const diagnostics: LocalModelTunnelDiagnostic[] = []
    const routes = getLocalModelTunnelRoutes(profile)

    for (const route of routes) {
      if (this.startTokens.get(profile.id) !== token) return
      const result = await this.startRouteCandidate(profile, route, token)
      diagnostics.push(...result.diagnostics)
      if (result.state === 'running' || result.state === 'cancelled') return
    }

    if (this.startTokens.get(profile.id) !== token) return
    this.startTokens.delete(profile.id)
    this.setStatus(profile, {
      state: 'failed',
      managed: false,
      pid: null,
      error: buildRouteSelectionFailureMessage(routes),
      activeRouteId: null,
      activeRouteLabel: null,
      diagnostics,
      health: await this.probeEndpoint(profile),
    })
    void this.broadcast()
  }

  private async startRouteCandidate(
    profile: LocalModelTunnelProfile,
    route: LocalModelTunnelRouteCandidate,
    token: symbol,
  ): Promise<RouteAttemptResult> {
    const command = buildLocalModelTunnelCommand(profile, route)
    const child = this.spawnTunnel(command.binary, command.args)
    let resolveExit: () => void = () => undefined
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve
    })
    const managed: ManagedProcess = {
      child,
      stopping: false,
      stderr: '',
      command,
      route,
      exitPromise,
      resolveExit,
    }
    const routeDiagnostics = buildRouteAttemptDiagnostics({
      command,
      route,
      probe: null,
      portOccupied: false,
      portOwner: null,
      exit: null,
    })
    this.processes.set(profile.id, managed)
    this.setStatus(profile, {
      state: 'starting',
      managed: true,
      pid: child.pid ?? null,
      error: null,
      activeRouteId: route.id,
      activeRouteLabel: route.label,
      diagnostics: routeDiagnostics,
    })
    void this.broadcast()

    child.stderr?.on('data', (chunk: Buffer) => {
      managed.stderr = `${managed.stderr}${chunk.toString()}`.slice(-4000)
    })

    const exitResult = await waitForRouteAttempt({
      managed,
      token,
      getActiveToken: () => this.startTokens.get(profile.id),
      probeEndpoint: () => this.probeEndpoint(profile, route),
    })

    managed.resolveExit()
    if (exitResult.state === 'cancelled') {
      return { state: 'cancelled', diagnostics: [], error: null }
    }

    if (exitResult.state === 'running') {
      this.startTokens.delete(profile.id)
      this.attachManagedExitHandler(profile, managed)
      this.setStatus(profile, {
        state: 'running',
        managed: true,
        pid: child.pid ?? null,
        error: null,
        health: exitResult.probe,
        activeRouteId: route.id,
        activeRouteLabel: route.label,
        diagnostics: buildRouteAttemptDiagnostics({
          command,
          route,
          probe: exitResult.probe,
          portOccupied: false,
          portOwner: null,
          exit: null,
        }),
      })
      void this.broadcast()
      return { state: 'running', diagnostics: [], error: null }
    }

    managed.stopping = true
    try {
      child.kill('SIGTERM')
    } catch {
      // Process may have already exited.
    }
    if (this.processes.get(profile.id) === managed) {
      this.processes.delete(profile.id)
    }
    const portOwner = exitResult.probe.responding
      ? await inspectLocalPortOwner(route.localPort)
      : null
    const diagnostics = buildRouteAttemptDiagnostics({
      command,
      route,
      probe: exitResult.probe,
      portOccupied: exitResult.probe.responding,
      portOwner,
      exit: exitResult.exit,
      stderr: managed.stderr,
    })
    this.setStatus(profile, {
      state: 'starting',
      managed: true,
      pid: null,
      error: exitResult.error,
      health: exitResult.probe,
      activeRouteId: route.id,
      activeRouteLabel: route.label,
      diagnostics,
    })
    void this.broadcast()
    return { state: 'failed', diagnostics, error: exitResult.error }
  }

  private attachManagedExitHandler(
    profile: LocalModelTunnelProfile,
    managed: ManagedProcess,
  ): void {
    managed.child.once('error', (error) => {
      managed.resolveExit()
      if (this.processes.get(profile.id) !== managed) return
      this.processes.delete(profile.id)
      this.setStatus(profile, {
        state: 'failed',
        managed: false,
        pid: null,
        error: error.message,
        diagnostics: [
          {
            label: 'SSH command',
            value: managed.command.preview,
          },
          {
            label: 'SSH error',
            value: error.message,
          },
        ],
      })
      void this.broadcast()
    })

    managed.child.once('exit', (code, signal) => {
      managed.resolveExit()
      if (this.processes.get(profile.id) !== managed) return
      this.processes.delete(profile.id)
      if (managed.stopping) {
        this.setStatus(profile, {
          state: 'stopped',
          managed: false,
          pid: null,
          error: null,
          activeRouteId: null,
          activeRouteLabel: null,
        })
      } else {
        this.setStatus(profile, {
          state: 'failed',
          managed: false,
          pid: null,
          error:
            managed.stderr.trim() ||
            `ssh exited with ${
              signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`
            }`,
          diagnostics: [
            {
              label: 'SSH command',
              value: managed.command.preview,
            },
            {
              label: 'SSH exit code',
              value: signal ? `signal ${signal}` : `${code ?? 'unknown'}`,
            },
            {
              label: 'SSH stderr',
              value: managed.stderr.trim() || '(empty)',
            },
          ],
        })
      }
      void this.broadcast()
    })
  }

  private async refreshMonitoredStatuses(): Promise<void> {
    await Promise.all(
      this.getProfiles().map((profile) => this.refreshProfileStatus(profile)),
    )
  }

  private async refreshProfileStatus(
    profile: LocalModelTunnelProfile,
  ): Promise<void> {
    const current = this.getStatus(profile)
    const managed = this.processes.get(profile.id)
    if (managed && current.state === 'starting') return

    const probe = await this.probeEndpoint(profile)
    if (managed) {
      this.setStatus(profile, {
        state: probe.available ? 'running' : 'failed',
        managed: true,
        pid: managed.child.pid ?? null,
        error: probe.available
          ? null
          : (probe.error ?? 'Local endpoint health check failed.'),
        health: probe,
      })
      return
    }

    if (profile.connectionKind === 'local-runtime') {
      this.setStatus(profile, {
        state: probe.available ? 'running' : 'stopped',
        managed: false,
        pid: null,
        error: null,
        health: probe,
      })
      return
    }

    if (probe.available && profile.allowExternal) {
      this.setStatus(profile, {
        state: 'external',
        managed: false,
        pid: null,
        error: null,
        health: probe,
        activeRouteId: null,
        activeRouteLabel: 'Endpoint already available',
      })
      return
    }

    if (current.state === 'external') {
      this.setStatus(profile, {
        state: 'stopped',
        managed: false,
        pid: null,
        error: null,
        health: probe,
      })
      return
    }

    this.setStatus(profile, {
      state: current.state === 'starting' ? 'stopped' : current.state,
      managed: false,
      pid: null,
      error: current.error,
      health: probe,
    })
  }

  private async probeEndpoint(
    profile: LocalModelTunnelProfile,
    route?: LocalModelTunnelRouteCandidate,
  ): Promise<ProbeResult> {
    if (profile.healthCheckEnabled && profile.healthCheckUrl) {
      return probeHealthUrl(
        route
          ? getRouteEffectiveHealthCheckUrl(profile, route)
          : profile.healthCheckUrl,
      )
    }
    const host = route
      ? getEffectiveRouteLocalBindHost(route)
      : getEffectiveLocalBindHost(profile)
    const port = route ? route.localPort : profile.localPort
    return probeTcp(host, port, PROBE_TIMEOUT_MS)
  }

  private getProfiles(): LocalModelTunnelProfile[] {
    const raw = this.state.get(LOCAL_MODEL_TUNNEL_PROFILES_KEY)
    return parseLocalModelTunnelProfiles(raw)
  }

  private saveProfiles(profiles: LocalModelTunnelProfile[]): void {
    this.state.set(LOCAL_MODEL_TUNNEL_PROFILES_KEY, JSON.stringify(profiles))
  }

  private requireProfile(profileId: string): LocalModelTunnelProfile {
    const profile = this.getProfiles().find((item) => item.id === profileId)
    if (!profile) throw new Error(`Unknown local model tunnel: ${profileId}`)
    return profile
  }

  private buildSnapshot(): LocalModelTunnelSnapshot {
    return {
      profiles: this.getProfiles().map((profile) => ({
        profile,
        status: this.getStatus(profile),
      })),
      updatedAt: new Date().toISOString(),
    }
  }

  private async broadcast(): Promise<LocalModelTunnelSnapshot> {
    const snapshot = this.buildSnapshot()
    this.emit(snapshot)
    return snapshot
  }

  private getStatus(
    profile: LocalModelTunnelProfile,
  ): LocalModelTunnelRuntimeStatus {
    const current = this.statuses.get(profile.id)
    if (current) {
      const route = findRouteById(profile, current.activeRouteId)
      return {
        ...current,
        commandPreview: buildLocalModelTunnelCommand(profile, route).preview,
      }
    }
    const status = this.defaultStatus(profile)
    this.statuses.set(profile.id, status)
    return status
  }

  private defaultStatus(
    profile: LocalModelTunnelProfile,
  ): LocalModelTunnelRuntimeStatus {
    return {
      profileId: profile.id,
      state: 'stopped',
      managed: false,
      pid: null,
      error: null,
      lastCheckedAt: null,
      health: unknownHealth(),
      activeRouteId: null,
      activeRouteLabel: null,
      diagnostics: [],
      commandPreview: buildLocalModelTunnelCommand(profile).preview,
    }
  }

  private setStatus(
    profile: LocalModelTunnelProfile,
    patch: Omit<
      Partial<LocalModelTunnelRuntimeStatus>,
      'profileId' | 'commandPreview' | 'lastCheckedAt'
    >,
  ): void {
    const checkedAt = patch.health?.checkedAt ?? new Date().toISOString()
    const current = this.getStatus(profile)
    const nextActiveRouteId =
      patch.activeRouteId === undefined
        ? current.activeRouteId
        : patch.activeRouteId
    const route = findRouteById(profile, nextActiveRouteId)
    this.statuses.set(profile.id, {
      ...current,
      ...patch,
      profileId: profile.id,
      lastCheckedAt: checkedAt,
      commandPreview: buildLocalModelTunnelCommand(profile, route).preview,
    })
  }

  startMonitoring(intervalMs = MONITOR_INTERVAL_MS): void {
    if (this.monitorTimer) return
    this.monitorTimer = setInterval(() => {
      void this.refreshMonitoredStatuses().then(() => this.broadcast())
    }, intervalMs)
    this.monitorTimer.unref?.()
    void this.refreshMonitoredStatuses().then(() => this.broadcast())
  }

  stopMonitoring(): void {
    if (!this.monitorTimer) return
    clearInterval(this.monitorTimer)
    this.monitorTimer = null
  }
}

async function waitForRouteAttempt(input: {
  managed: ManagedProcess
  token: symbol
  getActiveToken: () => symbol | undefined
  probeEndpoint: () => Promise<ProbeResult>
}): Promise<WaitRouteAttemptResult> {
  const { managed } = input
  let settled = false
  let exit: RouteExitResult | null = null
  let cleanupExitListeners: () => void = () => undefined

  const resolveOnce = (result: RouteExitResult) => {
    if (settled) return
    settled = true
    exit = result
    cleanupExitListeners()
  }
  const onError = (error: Error) =>
    resolveOnce({
      kind: 'error',
      code: null,
      signal: null,
      error,
    })
  const onExit = (code: number | null, signal: NodeJS.Signals | null) =>
    resolveOnce({
      kind: 'exit',
      code,
      signal,
      error: null,
    })
  cleanupExitListeners = () => {
    managed.child.off('error', onError)
    managed.child.off('exit', onExit)
  }
  managed.child.once('error', onError)
  managed.child.once('exit', onExit)

  for (let attempt = 0; attempt < STARTUP_PROBE_ATTEMPTS; attempt += 1) {
    await delay(STARTUP_PROBE_DELAY_MS)
    if (input.getActiveToken() !== input.token || managed.stopping) {
      settled = true
      cleanupExitListeners()
      return { state: 'cancelled' }
    }
    if (exit) {
      const probe = await input.probeEndpoint()
      return {
        state: 'failed',
        probe,
        exit,
        error: formatSshExitError(exit, managed.stderr),
      }
    }

    const probe = await input.probeEndpoint()
    if (probe.available) {
      settled = true
      cleanupExitListeners()
      return { state: 'running', probe }
    }
    if (probe.responding && !probe.available) {
      return {
        state: 'failed',
        probe,
        exit,
        error:
          probe.error ?? 'Health URL did not return a usable Ollama response.',
      }
    }
  }

  const probe = await input.probeEndpoint()
  return {
    state: 'failed',
    probe,
    exit,
    error: 'Tunnel started, but the local endpoint did not become available.',
  }
}

function formatLocalPortConflictError(localPort: number): string {
  return `Local port ${localPort} is already in use by another runtime. Choose another local port or stop the process using it.`
}

function buildLocalPortConflictDiagnostics(input: {
  profile: LocalModelTunnelProfile
  probe: ProbeResult
  portOwner: string | null
}): LocalModelTunnelDiagnostic[] {
  return [
    {
      label: 'Local port occupied',
      value: `${getEffectiveLocalBindHost(input.profile)}:${input.profile.localPort}`,
    },
    {
      label: 'Health URL',
      value: describeProbe(input.probe),
    },
    {
      label: 'Process using the port',
      value: input.portOwner ?? '(not available)',
    },
  ]
}

function buildRouteAttemptDiagnostics(input: {
  command: LocalModelTunnelCommand
  route: LocalModelTunnelRouteCandidate
  probe: ProbeResult | null
  portOccupied: boolean
  portOwner: string | null
  exit: RouteExitResult | null
  stderr?: string
}): LocalModelTunnelDiagnostic[] {
  const diagnostics: LocalModelTunnelDiagnostic[] = [
    {
      label: `${input.route.label} SSH command`,
      value: input.command.preview,
    },
    {
      label: `${input.route.label} local port occupied`,
      value: input.portOccupied ? 'yes' : 'no',
    },
    {
      label: `${input.route.label} remote host check`,
      value: describeRemoteHostCheck(input.route),
    },
  ]
  if (input.exit) {
    diagnostics.push({
      label: `${input.route.label} SSH exit code`,
      value:
        input.exit.kind === 'error'
          ? (input.exit.error?.message ?? 'spawn error')
          : input.exit.signal
            ? `signal ${input.exit.signal}`
            : `${input.exit.code ?? 'unknown'}`,
    })
  }
  if (input.stderr !== undefined) {
    diagnostics.push({
      label: `${input.route.label} SSH stderr`,
      value: input.stderr.trim() || '(empty)',
    })
  }
  if (input.probe) {
    diagnostics.push({
      label: `${input.route.label} health URL`,
      value: describeProbe(input.probe),
    })
  }
  if (input.portOwner) {
    diagnostics.push({
      label: `${input.route.label} process using the port`,
      value: input.portOwner,
    })
  }
  return diagnostics
}

function buildRouteSelectionFailureMessage(
  routes: LocalModelTunnelRouteCandidate[],
): string {
  const routeLabels = routes.map((route) => route.label).join(', ')
  return `Unable to start local model tunnel. Tried ${routeLabels}.`
}

function findRouteById(
  profile: LocalModelTunnelProfile,
  routeId: string | null,
): LocalModelTunnelRouteCandidate {
  const routes = getLocalModelTunnelRoutes(profile)
  return routes.find((route) => route.id === routeId) ?? routes[0]!
}

function describeRemoteHostCheck(
  route: LocalModelTunnelRouteCandidate,
): string {
  if (route.remoteHost === route.sshTarget) {
    return 'warning: remote host matches SSH target; use 127.0.0.1 for runtimes bound on the SSH host localhost'
  }
  return route.remoteHost === '127.0.0.1' ? 'ok' : 'custom remote host'
}

function describeProbe(probe: ProbeResult): string {
  const parts = [
    probe.responding ? 'responding' : 'not responding',
    probe.available ? 'healthy' : 'unhealthy',
  ]
  if (probe.statusCode !== null) parts.push(`HTTP ${probe.statusCode}`)
  if (probe.failureKind) parts.push(probe.failureKind)
  if (probe.error) parts.push(probe.error)
  return parts.join(' · ')
}

function formatSshExitError(exit: RouteExitResult, stderr: string): string {
  if (exit.kind === 'error') return exit.error?.message ?? 'ssh failed to start'
  const suffix = exit.signal
    ? `signal ${exit.signal}`
    : `code ${exit.code ?? 'unknown'}`
  return stderr.trim() || `ssh exited with ${suffix}`
}

function inspectLocalPortOwner(port: number): Promise<string | null> {
  const args = ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']
  return new Promise((resolve) => {
    execFile('lsof', args, { timeout: 1000 }, (error, stdout, stderr) => {
      if (error) {
        resolve(stderr.trim() || null)
        return
      }
      const trimmed = stdout.trim()
      resolve(trimmed ? `lsof ${args.join(' ')}\n${trimmed}` : null)
    })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function probeTcp(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const socket = connect({ host, port })
    const finish = (available: boolean) => {
      const checkedAt = new Date().toISOString()
      socket.removeAllListeners()
      socket.destroy()
      resolve({
        available,
        responding: available,
        state: available ? 'healthy' : 'unhealthy',
        probeKind: 'tcp',
        checkedAt,
        latencyMs: Date.now() - startedAt,
        statusCode: null,
        modelCount: null,
        modelNames: null,
        isOllama: null,
        failureKind: available ? null : 'network-error',
        error: available ? null : `TCP connection to ${host}:${port} failed.`,
      })
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function probeHealthUrl(url: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      resolve({
        ...unhealthyHealth('Invalid health URL.'),
        available: false,
        responding: false,
        failureKind: 'invalid-url',
      })
      return
    }

    const request = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const req = request(
      parsed,
      { method: 'GET', timeout: PROBE_TIMEOUT_MS },
      (res) => {
        const chunks: Buffer[] = []
        let bytes = 0
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes <= 64_000) chunks.push(chunk)
        })
        res.on('end', () => {
          const statusCode = res.statusCode ?? 500
          const ollama = extractOllamaHealth(Buffer.concat(chunks))
          const available = statusCode === 200 && ollama.isOllama
          const failureKind =
            statusCode === 200 ? ollama.failureKind : 'non-200'
          const error = buildHealthProbeError(statusCode, failureKind)
          resolve({
            available,
            responding: true,
            state: available ? 'healthy' : 'unhealthy',
            probeKind: 'http',
            checkedAt: new Date().toISOString(),
            latencyMs: Date.now() - startedAt,
            statusCode,
            modelCount: ollama.modelCount,
            modelNames: ollama.modelNames,
            isOllama: ollama.isOllama,
            failureKind: available ? null : failureKind,
            error,
          })
        })
      },
    )
    req.once('timeout', () => {
      req.destroy()
      resolve({
        ...unhealthyHealth('Health URL request timed out.'),
        available: false,
        responding: false,
        failureKind: 'timeout',
      })
    })
    req.once('error', (error: NodeJS.ErrnoException) =>
      resolve({
        ...unhealthyHealth(formatRequestError(error)),
        available: false,
        responding: false,
        failureKind: mapRequestErrorToFailureKind(error),
      }),
    )
    req.end()
  })
}

function unknownHealth(): LocalModelTunnelHealthStatus {
  return {
    state: 'unknown',
    probeKind: null,
    checkedAt: null,
    latencyMs: null,
    statusCode: null,
    modelCount: null,
    modelNames: null,
    isOllama: null,
    failureKind: null,
    error: null,
  }
}

function unhealthyHealth(error: string): LocalModelTunnelHealthStatus {
  return {
    state: 'unhealthy',
    probeKind: 'http',
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    statusCode: null,
    modelCount: null,
    modelNames: null,
    isOllama: null,
    failureKind: 'network-error',
    error,
  }
}

function buildHealthProbeError(
  statusCode: number,
  failureKind: LocalModelTunnelHealthFailureKind | null,
): string | null {
  if (statusCode !== 200) return `Health URL returned HTTP ${statusCode}.`
  if (failureKind === 'invalid-json') return 'Health URL returned invalid JSON.'
  if (failureKind === 'not-ollama-json') {
    return 'Health URL returned JSON that is not an Ollama /api/tags response.'
  }
  return null
}

function extractOllamaHealth(buffer: Buffer): {
  isOllama: boolean
  modelCount: number | null
  modelNames: string[] | null
  failureKind: LocalModelTunnelHealthFailureKind | null
} {
  try {
    const parsed = JSON.parse(buffer.toString()) as { models?: unknown }
    if (!Array.isArray(parsed.models)) {
      return {
        isOllama: false,
        modelCount: null,
        modelNames: null,
        failureKind: 'not-ollama-json',
      }
    }
    const modelNames = parsed.models.flatMap((model) => {
      if (!model || typeof model !== 'object') return []
      const record = model as { name?: unknown; model?: unknown }
      const name = typeof record.name === 'string' ? record.name : null
      const modelId = typeof record.model === 'string' ? record.model : null
      return [name, modelId].filter((value): value is string => !!value)
    })
    return {
      isOllama: true,
      modelCount: parsed.models.length,
      modelNames,
      failureKind: null,
    }
  } catch {
    return {
      isOllama: false,
      modelCount: null,
      modelNames: null,
      failureKind: 'invalid-json',
    }
  }
}

function formatRequestError(error: NodeJS.ErrnoException): string {
  if (error.code === 'ECONNRESET') return 'Health URL connection reset.'
  if (error.code === 'ECONNREFUSED') return 'Health URL connection refused.'
  return error.message
}

function mapRequestErrorToFailureKind(
  error: NodeJS.ErrnoException,
): LocalModelTunnelHealthFailureKind {
  if (error.code === 'ECONNRESET') return 'connection-reset'
  if (error.code === 'ECONNREFUSED') return 'connection-refused'
  return 'network-error'
}
