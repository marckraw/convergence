import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import type { ChildProcess } from 'child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateService } from '../state/state.service'
import {
  buildDefaultLocalModelTunnelProfile,
  LOCAL_MODEL_TUNNEL_PROFILES_KEY,
} from './local-model-tunnel.pure'
import { LocalModelTunnelService } from './local-model-tunnel.service'
import type { LocalModelTunnelProfile } from './local-model-tunnel.types'

const { connectMock, httpRequestMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  httpRequestMock: vi.fn(),
}))

vi.mock('net', () => ({
  connect: connectMock,
}))

vi.mock('http', () => ({
  request: httpRequestMock,
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

class MockHttpRequest extends EventEmitter {
  end = vi.fn()
  destroy = vi.fn()
}

function mockTcpFailure() {
  connectMock.mockImplementation(() => {
    const socket = new MockSocket()
    queueMicrotask(() => socket.emit('error', new Error('not listening')))
    return socket
  })
}

function mockHttpFailure() {
  httpRequestMock.mockImplementation(() => {
    const request = new MockHttpRequest()
    request.end.mockImplementation(() => {
      queueMicrotask(() => {
        const error = new Error('connect ECONNREFUSED') as NodeJS.ErrnoException
        error.code = 'ECONNREFUSED'
        request.emit('error', error)
      })
    })
    return request
  })
}

function mockOllamaTagsResponse(models: string[]) {
  httpRequestMock.mockImplementation((_url, _options, callback) => {
    const request = new MockHttpRequest()
    const response = new EventEmitter() as EventEmitter & {
      statusCode: number
    }
    response.statusCode = 200
    request.end.mockImplementation(() => {
      queueMicrotask(() => {
        callback(response)
        response.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              models: models.map((name) => ({ name, model: name })),
            }),
          ),
        )
        response.emit('end')
      })
    })
    return request
  })
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

/**
 * Everything a test started, so teardown can stop it (MAR-2250).
 *
 * `start()` leaves a background loop probing for seconds after it resolves.
 * A suite that walks away from those loops leaves them running into the next
 * test's teardown, which is where the load-only CI ghost came from.
 */
const started: { service: LocalModelTunnelService; profileIds: string[] }[] = []

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
  started.push({ service, profileIds: profiles.map((profile) => profile.id) })

  return { children, emit, service, spawnTunnel, state }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Polls rather than sleeps a fixed span, so a loaded machine waits longer
 * instead of reporting a green it did not earn.
 */
async function until(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await wait(25)
  }
  throw new Error(`Condition not met within ${timeoutMs}ms.`)
}

/** Collects what would otherwise crash the main process, for one test. */
function collectUnhandledRejections(): {
  reasons: unknown[]
  stop: () => void
} {
  const reasons: unknown[] = []
  const listener = (reason: unknown) => reasons.push(reason)
  process.on('unhandledRejection', listener)
  return {
    reasons,
    stop: () => process.off('unhandledRejection', listener),
  }
}

beforeEach(() => {
  mockTcpFailure()
  mockHttpFailure()
})

afterEach(async () => {
  // Stop what this test started, before anything else is torn down. Each
  // `stop()` clears the profile's start token, which is what makes a running
  // route loop return at its next check instead of probing into the next test.
  for (const entry of started.splice(0)) {
    entry.service.stopMonitoring()
    for (const profileId of entry.profileIds) {
      await entry.service.stop(profileId)
    }
  }

  // `mockClear`, deliberately, not `mockReset`: reset strips the
  // implementation, so a probe still in flight would be handed `undefined` by
  // its transport and reach for `.once` on nothing — the exact TypeError CI
  // reported. Calls are forgotten; the safe fake stays installed.
  connectMock.mockClear()
  httpRequestMock.mockClear()
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
      'Local port 11434 is already in use by another runtime',
    )
    expect(snapshot.profiles[0]?.status.health.state).toBe('healthy')
  })

  it('marks an allowed already-running Ollama endpoint as external', async () => {
    mockOllamaTagsResponse(['pgx-devstral-small-2-64k'])
    const profile = createProfile({
      allowExternal: true,
      localPort: 11436,
      healthCheckUrl: 'http://127.0.0.1:11436/api/tags',
    })
    const { service, spawnTunnel } = createService([profile])

    const snapshot = await service.start(profile.id)

    expect(spawnTunnel).not.toHaveBeenCalled()
    expect(snapshot.profiles[0]?.status.state).toBe('external')
    expect(snapshot.profiles[0]?.status.activeRouteLabel).toBe(
      'Endpoint already available',
    )
    expect(snapshot.profiles[0]?.status.health.isOllama).toBe(true)
  })

  it('does not accept an externally managed endpoint unless the profile allows it', async () => {
    mockOllamaTagsResponse(['pgx-devstral-small-2-64k'])
    const profile = createProfile({
      allowExternal: false,
      localPort: 11436,
      healthCheckUrl: 'http://127.0.0.1:11436/api/tags',
    })
    const { service, spawnTunnel } = createService([profile])

    const snapshot = await service.start(profile.id)

    expect(spawnTunnel).not.toHaveBeenCalled()
    expect(snapshot.profiles[0]?.status.state).toBe('failed')
    expect(snapshot.profiles[0]?.status.error).toContain(
      'Local port 11436 is already in use by another runtime',
    )
    expect(snapshot.profiles[0]?.status.health.isOllama).toBe(true)
  })

  it('falls back from the LAN route to the Tailscale route', async () => {
    const profile = createProfile({
      healthCheckEnabled: false,
      healthCheckUrl: '',
      localPort: 11436,
      routeCandidates: [
        {
          id: 'lan',
          label: 'Connected via LAN',
          sshTarget: 'little-monster',
          useCustomLocalBindHost: false,
          localBindHost: '127.0.0.1',
          localPort: 11436,
          remoteHost: '127.0.0.1',
          remotePort: 11434,
          healthCheckUrl: 'http://127.0.0.1:11436/api/tags',
          connectTimeoutSeconds: 5,
        },
        {
          id: 'tailscale',
          label: 'Connected via Tailscale',
          sshTarget: 'little-monster-ts',
          useCustomLocalBindHost: false,
          localBindHost: '127.0.0.1',
          localPort: 11436,
          remoteHost: '127.0.0.1',
          remotePort: 11434,
          healthCheckUrl: 'http://127.0.0.1:11436/api/tags',
          connectTimeoutSeconds: 8,
        },
      ],
    })
    const { children, service, spawnTunnel } = createService([profile])
    spawnTunnel.mockImplementation(() => {
      const child = new MockChildProcess(1000 + children.length, false)
      children.push(child)
      if (children.length === 1) {
        queueMicrotask(() => {
          child.stderr.write('ssh: connect to host little-monster timed out')
          child.emit('exit', 255, null)
        })
      }
      return child as unknown as ChildProcess
    })
    connectMock.mockImplementation(() => {
      const socket = new MockSocket()
      queueMicrotask(() => {
        if (children.length >= 2) {
          socket.emit('connect')
        } else {
          socket.emit('error', new Error('not listening'))
        }
      })
      return socket
    })

    await service.start(profile.id)
    await wait(700)
    const snapshot = await service.getSnapshot()

    expect(spawnTunnel).toHaveBeenCalledTimes(2)
    expect(snapshot.profiles[0]?.status.state).toBe('running')
    expect(snapshot.profiles[0]?.status.activeRouteLabel).toBe(
      'Connected via Tailscale',
    )
    expect(snapshot.profiles[0]?.status.commandPreview).toContain(
      '-- little-monster-ts',
    )
  })

  it('answers unhealthy when a probe transport hands back nothing (MAR-2250)', async () => {
    // The ghost, reproduced: `http.request` returning undefined makes the
    // probe reach for `.once` on nothing — `TypeError: Cannot read properties
    // of undefined (reading 'once')`, verbatim from CI. A probe is a question
    // about the world; it must always answer, and "I could not tell" is an
    // answer. Exploding instead takes whichever caller was awaiting it down.
    httpRequestMock.mockReturnValue(undefined)
    const profile = createProfile({
      healthCheckUrl: 'http://127.0.0.1:11439/api/tags',
      localPort: 11439,
    })
    const { children, service, spawnTunnel } = createService([profile])
    spawnTunnel.mockImplementation(() => {
      const child = new MockChildProcess(1000 + children.length, false)
      children.push(child)
      queueMicrotask(() => child.emit('exit', 255, null))
      return child as unknown as ChildProcess
    })

    const snapshot = await service.start(profile.id)

    expect(snapshot.profiles[0]?.status.health.state).toBe('unhealthy')
    expect(snapshot.profiles[0]?.status.health.error).toBeTruthy()
  })

  it('keeps a background start failure out of the unhandled-rejection channel (MAR-2250)', async () => {
    // `start()` returns while `startRouteCandidates` keeps working for up to
    // three seconds per route. Nobody holds that promise, so anything it
    // throws goes straight to the process's unhandled-rejection channel —
    // which is why the failure surfaced on CI attributed to this file's slot
    // long after the test that started it had passed, and only under load.
    const collected = collectUnhandledRejections()
    try {
      const profile = createProfile({
        healthCheckEnabled: false,
        healthCheckUrl: '',
        localPort: 11440,
      })
      const { service, spawnTunnel } = createService([profile])
      spawnTunnel.mockImplementation(() => {
        throw new Error('spawn ENOMEM')
      })

      await service.start(profile.id)
      // Polls for the terminal state rather than for "no longer starting":
      // an unmanaged profile reads as "stopped" in between, and settling for
      // that would let the failure never arrive and still pass.
      await until(async () => {
        const snapshot = await service.getSnapshot()
        return snapshot.profiles[0]?.status.state === 'failed'
      })

      const snapshot = await service.getSnapshot()
      expect(snapshot.profiles[0]?.status.error).toContain('spawn ENOMEM')
      expect(collected.reasons).toEqual([])
    } finally {
      collected.stop()
    }
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
