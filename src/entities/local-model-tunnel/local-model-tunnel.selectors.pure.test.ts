import { describe, expect, it } from 'vitest'
import {
  formatLocalModelTunnelConnectionLabel,
  formatLocalModelTunnelEndpoint,
  formatLocalModelTunnelStatusDetail,
  selectLocalModelTunnelAggregate,
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
      error: null,
    },
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

  it('formats endpoint summaries through the ssh target', () => {
    expect(formatLocalModelTunnelEndpoint(item('running'))).toBe(
      '127.0.0.1:11434 -> little-monster:127.0.0.1:11434',
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
