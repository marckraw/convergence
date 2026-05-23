import { randomUUID } from 'crypto'
import { spawn, type ChildProcess } from 'child_process'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { connect } from 'net'
import type { StateService } from '../state/state.service'
import {
  applyLocalModelTunnelProfileInput,
  buildDefaultLocalModelTunnelProfile,
  buildLocalModelTunnelCommand,
  getEffectiveLocalBindHost,
  LOCAL_MODEL_TUNNEL_PROFILES_KEY,
  parseLocalModelTunnelProfiles,
} from './local-model-tunnel.pure'
import type {
  LocalModelTunnelEventEmitter,
  LocalModelTunnelProfile,
  LocalModelTunnelProfileInput,
  LocalModelTunnelRuntimeStatus,
  LocalModelTunnelSnapshot,
} from './local-model-tunnel.types'

type SpawnTunnel = (binary: string, args: string[]) => ChildProcess

const STARTUP_PROBE_ATTEMPTS = 12
const STARTUP_PROBE_DELAY_MS = 250
const PROBE_TIMEOUT_MS = 800
const STOP_WAIT_TIMEOUT_MS = 1000

interface ManagedProcess {
  child: ChildProcess
  stopping: boolean
  stderr: string
  exitPromise: Promise<void>
  resolveExit: () => void
}

export class LocalModelTunnelService {
  private readonly processes = new Map<string, ManagedProcess>()
  private readonly statuses = new Map<string, LocalModelTunnelRuntimeStatus>()

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
    await this.refreshExternalStatuses()
    return this.buildSnapshot()
  }

  async start(profileId: string): Promise<LocalModelTunnelSnapshot> {
    const profile = this.requireProfile(profileId)
    const existing = this.processes.get(profile.id)
    if (existing) {
      this.setStatus(profile, {
        state: 'running',
        managed: true,
        pid: existing.child.pid ?? null,
        error: null,
      })
      return this.broadcast()
    }

    if (await this.isEndpointAvailable(profile)) {
      this.setStatus(profile, {
        state: 'external',
        managed: false,
        pid: null,
        error: null,
      })
      return this.broadcast()
    }

    const command = buildLocalModelTunnelCommand(profile)
    const child = this.spawnTunnel(command.binary, command.args)
    let resolveExit: () => void = () => undefined
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve
    })
    const managed: ManagedProcess = {
      child,
      stopping: false,
      stderr: '',
      exitPromise,
      resolveExit,
    }
    this.processes.set(profile.id, managed)
    this.setStatus(profile, {
      state: 'starting',
      managed: true,
      pid: child.pid ?? null,
      error: null,
    })
    void this.broadcast()

    child.stderr?.on('data', (chunk: Buffer) => {
      managed.stderr = `${managed.stderr}${chunk.toString()}`.slice(-4000)
    })

    child.on('error', (error) => {
      managed.resolveExit()
      if (this.processes.get(profile.id) !== managed) return
      this.processes.delete(profile.id)
      this.setStatus(profile, {
        state: 'failed',
        managed: false,
        pid: null,
        error: error.message,
      })
      void this.broadcast()
    })

    child.on('exit', (code, signal) => {
      managed.resolveExit()
      if (this.processes.get(profile.id) !== managed) return
      this.processes.delete(profile.id)
      if (managed.stopping) {
        this.setStatus(profile, {
          state: 'stopped',
          managed: false,
          pid: null,
          error: null,
        })
      } else {
        this.setStatus(profile, {
          state: 'failed',
          managed: false,
          pid: null,
          error:
            managed.stderr.trim() ||
            `ssh exited with ${signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`}`,
        })
      }
      void this.broadcast()
    })

    void this.markRunningWhenAvailable(profile, managed)
    return this.buildSnapshot()
  }

  async stop(profileId: string): Promise<LocalModelTunnelSnapshot> {
    const profile = this.requireProfile(profileId)
    const managed = this.processes.get(profile.id)
    if (!managed) {
      this.setStatus(profile, {
        state: 'stopped',
        managed: false,
        pid: null,
        error: null,
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

  private async markRunningWhenAvailable(
    profile: LocalModelTunnelProfile,
    managed: ManagedProcess,
  ): Promise<void> {
    for (let attempt = 0; attempt < STARTUP_PROBE_ATTEMPTS; attempt += 1) {
      await delay(STARTUP_PROBE_DELAY_MS)
      if (this.processes.get(profile.id) !== managed || managed.stopping) return
      if (await this.isEndpointAvailable(profile)) {
        if (this.processes.get(profile.id) !== managed || managed.stopping) {
          return
        }
        this.setStatus(profile, {
          state: 'running',
          managed: true,
          pid: managed.child.pid ?? null,
          error: null,
        })
        void this.broadcast()
        return
      }
    }

    if (this.processes.get(profile.id) !== managed || managed.stopping) return
    managed.stopping = true
    try {
      managed.child.kill('SIGTERM')
    } catch {
      // exit handler will not fire if the child is already gone
    }
    this.processes.delete(profile.id)
    this.setStatus(profile, {
      state: 'failed',
      managed: false,
      pid: null,
      error: 'Tunnel started, but the local endpoint did not become available.',
    })
    void this.broadcast()
  }

  private async refreshExternalStatuses(): Promise<void> {
    await Promise.all(
      this.getProfiles().map(async (profile) => {
        if (this.processes.has(profile.id)) return
        const current = this.getStatus(profile)
        const available = await this.isEndpointAvailable(profile)
        if (available) {
          this.setStatus(profile, {
            state: 'external',
            managed: false,
            pid: null,
            error: null,
          })
        } else if (current.state === 'external') {
          this.setStatus(profile, {
            state: 'stopped',
            managed: false,
            pid: null,
            error: null,
          })
        }
      }),
    )
  }

  private async isEndpointAvailable(
    profile: LocalModelTunnelProfile,
  ): Promise<boolean> {
    if (profile.healthCheckEnabled && profile.healthCheckUrl) {
      return probeHealthUrl(profile.healthCheckUrl)
    }
    return probeTcp(
      getEffectiveLocalBindHost(profile),
      profile.localPort,
      PROBE_TIMEOUT_MS,
    )
  }

  private getProfiles(): LocalModelTunnelProfile[] {
    return parseLocalModelTunnelProfiles(
      this.state.get(LOCAL_MODEL_TUNNEL_PROFILES_KEY),
    )
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
      return {
        ...current,
        commandPreview: buildLocalModelTunnelCommand(profile).preview,
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
    this.statuses.set(profile.id, {
      ...this.getStatus(profile),
      ...patch,
      profileId: profile.id,
      lastCheckedAt: new Date().toISOString(),
      commandPreview: buildLocalModelTunnelCommand(profile).preview,
    })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function probeTcp(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    const finish = (available: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(available)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function probeHealthUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      resolve(false)
      return
    }

    const request = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const req = request(
      parsed,
      { method: 'GET', timeout: PROBE_TIMEOUT_MS },
      (res) => {
        res.resume()
        resolve((res.statusCode ?? 500) < 500)
      },
    )
    req.once('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.once('error', () => resolve(false))
    req.end()
  })
}
