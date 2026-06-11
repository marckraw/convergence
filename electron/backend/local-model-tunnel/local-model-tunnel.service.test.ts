import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import type { ChildProcess } from 'child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StateService } from '../state/state.service'
import {
  buildDefaultLocalModelTunnelProfile,
  LOCAL_MODEL_TUNNEL_PROFILES_KEY,
} from './local-model-tunnel.pure'
import { LocalModelTunnelService } from './local-model-tunnel.service'
import type { LocalModelTunnelProfile } from './local-model-tunnel.types'

const { connectMock } = vi.hoisted(() => ({ connectMock: vi.fn() }))

vi.mock('net', () => ({
  connect: connectMock,
}))

class MemoryState {
  private readonly values = new Map<string, string>()

  get(key: string): string | null {
    return this.values.get(key) ?? null
  }

  set(key: string, value: string): void {
    this.values.set(key, value)
  }

  delete(key: string): void {
    this.values.delete(key)
  }
}

class MockChildProcess extends EventEmitter {
  stderr = new PassThrough()
  killed = false
  pid: number

  constructor(
    pid: number,
    private readonly exitOnKill = true,
  ) {
    super()
    this.pid = pid
  }

  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    if (this.exitOnKill) {
      this.emit('exit', 0, null)
    }
    return true
  })
}

class MockSocket extends EventEmitter {
  setTimeout = vi.fn()
  destroy = vi.fn()
}

function createProfile(
  overrides: Partial<LocalModelTunnelProfile> = {},
): LocalModelTunnelProfile {
  return {
    ...buildDefaultLocalModelTunnelProfile('2026-01-01T00:00:00.000Z'),
    id: 'profile-1',
    connectionKind: 'ssh-tunnel',
    allowExternal: false,
    healthCheckEnabled: true,
    healthCheckUrl: 'http://127.0.0.1:1/not-available',
    ...overrides,
  }
}

function createService(profiles: LocalModelTunnelProfile[]) {
  const state = new MemoryState()
  state.set(LOCAL_MODEL_TUNNEL_PROFILES_KEY, JSON.stringify(profiles))
  const emit = vi.fn()
  const children: MockChildProcess[] = []
  const spawnTunnel = vi.fn(() => {
    const child = new MockChildProcess(1000 + children.length)
    children.push(child)
    return child as unknown as ChildProcess
  })
  const service = new LocalModelTunnelService(
    state as unknown as StateService,
    emit,
    spawnTunnel,
  )

  return { children, emit, service, spawnTunnel, state }
}

afterEach(() => {
  connectMock.mockReset()
  vi.restoreAllMocks()
})

describe('LocalModelTunnelService', () => {
  it('ignores delayed exit events from a previously stopped tunnel', async () => {
    const profile = createProfile()
    const { children, service, spawnTunnel } = createService([profile])
    spawnTunnel.mockImplementation(() => {
      const child = new MockChildProcess(1000 + children.length, false)
      children.push(child)
      return child as unknown as ChildProcess
    })

    await service.start(profile.id)
    await service.stop(profile.id)
    await service.start(profile.id)

    children[0].emit('exit', 0, null)

    const snapshot = await service.getSnapshot()
    expect(spawnTunnel).toHaveBeenCalledTimes(2)
    expect(snapshot.profiles[0]?.status.state).toBe('starting')
    expect(snapshot.profiles[0]?.status.managed).toBe(true)
    expect(snapshot.profiles[0]?.status.pid).toBe(1001)
  })

  it('restarts a managed tunnel after saving endpoint changes', async () => {
    const profile = createProfile()
    const { children, service, spawnTunnel } = createService([profile])

    await service.start(profile.id)
    const snapshot = await service.updateProfile(profile.id, {
      localPort: 11435,
    })

    expect(spawnTunnel).toHaveBeenCalledTimes(2)
    expect(children[0]?.killed).toBe(true)
    expect(snapshot.profiles[0]?.profile.localPort).toBe(11435)
    expect(snapshot.profiles[0]?.status.state).toBe('starting')
    expect(snapshot.profiles[0]?.status.commandPreview).toContain('11435')
  })

  it('marks an occupied endpoint as external instead of spawning ssh', async () => {
    connectMock.mockImplementation(() => {
      const socket = new MockSocket()
      queueMicrotask(() => socket.emit('connect'))
      return socket
    })
    const profile = createProfile({
      allowExternal: true,
      healthCheckEnabled: false,
      healthCheckUrl: '',
      localPort: 23456,
    })
    const { service, spawnTunnel } = createService([profile])

    const snapshot = await service.start(profile.id)

    expect(spawnTunnel).not.toHaveBeenCalled()
    expect(snapshot.profiles[0]?.status.state).toBe('external')
    expect(snapshot.profiles[0]?.status.managed).toBe(false)
  })

  it('does not confuse a local runtime with a remote ssh tunnel', async () => {
    connectMock.mockImplementation(() => {
      const socket = new MockSocket()
      queueMicrotask(() => socket.emit('connect'))
      return socket
    })
    const profile = createProfile({
      allowExternal: false,
      healthCheckEnabled: false,
      healthCheckUrl: '',
      localPort: 11434,
    })
    const { service, spawnTunnel } = createService([profile])

    const snapshot = await service.start(profile.id)

    expect(spawnTunnel).not.toHaveBeenCalled()
    expect(snapshot.profiles[0]?.status.state).toBe('failed')
    expect(snapshot.profiles[0]?.status.error).toContain(
      'local endpoint is already responding',
    )
    expect(snapshot.profiles[0]?.status.health.state).toBe('healthy')
  })

  it('monitors local runtimes without spawning ssh', async () => {
    connectMock.mockImplementation(() => {
      const socket = new MockSocket()
      queueMicrotask(() => socket.emit('connect'))
      return socket
    })
    const profile = createProfile({
      connectionKind: 'local-runtime',
      healthCheckEnabled: false,
      healthCheckUrl: '',
      localPort: 11434,
    })
    const { service, spawnTunnel } = createService([profile])

    const snapshot = await service.start(profile.id)

    expect(spawnTunnel).not.toHaveBeenCalled()
    expect(snapshot.profiles[0]?.status.state).toBe('running')
    expect(snapshot.profiles[0]?.status.managed).toBe(false)
    expect(snapshot.profiles[0]?.status.health.state).toBe('healthy')
  })
})
