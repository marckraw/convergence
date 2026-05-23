import { describe, expect, it } from 'vitest'
import {
  formatLocalModelTunnelEndpoint,
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
    sshTarget: 'little-monster',
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
})
