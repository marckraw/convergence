import { describe, expect, it } from 'vitest'
import {
  formatLocalModelTunnelConnectionLabel,
  formatLocalModelTunnelEndpoint,
  formatLocalModelTunnelStatusDetail,
  selectLocalModelTunnelAggregate,
  selectPreferredLocalModelTunnelProfileId,
} from './local-model-tunnel.selectors.pure'
import type { LocalModelTunnelProfileWithStatus } from './local-model-tunnel.types'

const item = (
  state: LocalModelTunnelProfileWithStatus['status']['state'],
  name = 'Little Monster Ollama',
): LocalModelTunnelProfileWithStatus => ({
  profile: {
    id: name,
    name,
    connectionKind: 'ssh-tunnel',
    sshTarget: 'little-monster',
    allowExternal: false,
    autoStart: false,
    useCustomLocalBindHost: false,
    localBindHost: '0.0.0.0',
    localPort: 11434,
    remoteHost: '127.0.0.1',
    remotePort: 11434,
    healthCheckEnabled: true,
    healthCheckUrl: 'http://127.0.0.1:11434/api/tags',
    routeCandidates: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  status: {
    profileId: name,
    state,
    managed: state === 'running',
    pid: state === 'running' ? 123 : null,
    error: null,
    lastCheckedAt: null,
    health: {
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
    },
    activeRouteId: null,
    activeRouteLabel: null,
    diagnostics: [],
    commandPreview: 'ssh ...',
  },
})

describe('local model tunnel selectors', () => {
  it('uses the profile name for a single configured tunnel', () => {
    expect(
      selectLocalModelTunnelAggregate({
        profiles: [item('running')],
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      label: 'Little Monster Ollama',
      detail: 'running',
      state: 'running',
      visible: true,
    })
  })

  it('prioritizes failed state in multi-profile aggregates', () => {
    expect(
      selectLocalModelTunnelAggregate({
        profiles: [item('running'), item('failed', 'Studio GPU')],
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      label: 'Local models',
      detail: '1 failed',
      state: 'failed',
    })
  })

  it('prefers the active profile when opening the manager', () => {
    expect(
      selectPreferredLocalModelTunnelProfileId([
        item('stopped', 'Old little monster'),
        item('running', 'little monster PGX'),
      ]),
    ).toBe('little monster PGX')
  })

  it('formats endpoint summaries through the ssh target', () => {
    expect(formatLocalModelTunnelEndpoint(item('running'))).toBe(
      '127.0.0.1:11434 -> little-monster:127.0.0.1:11434',
    )
  })

  it('formats endpoint summaries and labels for auto route profiles', () => {
    const base = item('running')
    const auto = {
      ...base,
      profile: {
        ...base.profile,
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
      },
      status: {
        ...base.status,
        activeRouteId: 'lan',
        activeRouteLabel: 'Connected via LAN',
      },
    }

    expect(formatLocalModelTunnelEndpoint(auto)).toBe(
      '127.0.0.1:11436 -> auto routes: little-monster, little-monster-ts',
    )
    expect(formatLocalModelTunnelConnectionLabel(auto)).toBe(
      'Connected via LAN',
    )
  })

  it('formats endpoint summaries for local runtimes', () => {
    const base = item('running')
    const localRuntime = {
      ...base,
      profile: {
        ...base.profile,
        connectionKind: 'local-runtime' as const,
      },
    }

    expect(formatLocalModelTunnelEndpoint(localRuntime)).toBe(
      '127.0.0.1:11434 on this Mac',
    )
    expect(formatLocalModelTunnelConnectionLabel(localRuntime)).toBe('This Mac')
  })

  it('does not describe an occupied ssh tunnel port as running locally', () => {
    const base = item('stopped')
    expect(
      formatLocalModelTunnelStatusDetail({
        ...base,
        status: {
          ...base.status,
          health: {
            ...base.status.health,
            state: 'healthy',
            probeKind: 'http',
            checkedAt: '2026-01-01T00:00:00.000Z',
            statusCode: 200,
            modelCount: 8,
          },
        },
      }),
    ).toBe('local port occupied')
  })
})
