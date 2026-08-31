import { describe, expect, it } from 'vitest'
import {
  applyLocalModelTunnelProfileInput,
  buildDefaultLocalModelTunnelProfile,
  buildLocalModelTunnelCommand,
  getLocalModelTunnelRoutes,
  parseLocalModelTunnelProfiles,
} from './local-model-tunnel.pure'
import type { LocalModelTunnelProfile } from './local-model-tunnel.types'

describe('local model tunnel pure helpers', () => {
  it('builds the managed ssh tunnel command', () => {
    const profile = {
      ...buildDefaultLocalModelTunnelProfile('2026-01-01T00:00:00.000Z'),
      connectionKind: 'ssh-tunnel' as const,
      useCustomLocalBindHost: true,
      localBindHost: '0.0.0.0',
      localPort: 11435,
      remoteHost: '10.0.0.5',
      remotePort: 8080,
      sshTarget: 'gpu-box',
    }

    expect(buildLocalModelTunnelCommand(profile)).toEqual({
      binary: 'ssh',
      args: [
        '-N',
        '-T',
        '-o',
        'BatchMode=yes',
        '-o',
        'ExitOnForwardFailure=yes',
        '-o',
        'ServerAliveInterval=30',
        '-o',
        'ServerAliveCountMax=2',
        '-L',
        '0.0.0.0:11435:10.0.0.5:8080',
        '--',
        'gpu-box',
      ],
      preview:
        'ssh -N -T -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=2 -L 0.0.0.0:11435:10.0.0.5:8080 -- gpu-box',
    })
  })

  it('parses a default profile when stored state is empty or invalid', () => {
    expect(parseLocalModelTunnelProfiles(null)).toHaveLength(1)
    expect(parseLocalModelTunnelProfiles('not json')).toHaveLength(1)
    expect(parseLocalModelTunnelProfiles('[]')).toHaveLength(1)
  })

  it('does not seed user-specific tunnel profiles for fresh state', () => {
    const profiles = parseLocalModelTunnelProfiles(null)

    expect(profiles).toHaveLength(1)
    expect(profiles[0]?.name).toBe('Local Ollama')
    expect(profiles[0]?.sshTarget).toBe('my-gpu-host')
    expect(profiles[0]?.autoStart).toBe(false)
  })

  it('builds commands for user-configured route candidates', () => {
    const profile = createAutoRouteProfile()
    const [lan, tailscale] = getLocalModelTunnelRoutes(profile)

    expect(buildLocalModelTunnelCommand(profile, lan).preview).toBe(
      'ssh -N -T -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=2 -o ConnectTimeout=5 -L 127.0.0.1:11436:127.0.0.1:11434 -- little-monster',
    )
    expect(buildLocalModelTunnelCommand(profile, tailscale).preview).toBe(
      'ssh -N -T -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=2 -o ConnectTimeout=8 -L 127.0.0.1:11436:127.0.0.1:11434 -- little-monster-ts',
    )
  })

  it('treats legacy stored profiles as ssh tunnels', () => {
    const [profile] = parseLocalModelTunnelProfiles(
      JSON.stringify([
        {
          id: 'legacy',
          name: 'PGX Ollama',
          sshTarget: 'pgx-lenovo',
          localPort: 11434,
          remoteHost: '127.0.0.1',
          remotePort: 11434,
          healthCheckEnabled: true,
          healthCheckUrl: 'http://127.0.0.1:11434/api/tags',
        },
      ]),
    )

    expect(profile?.connectionKind).toBe('ssh-tunnel')
    expect(profile?.allowExternal).toBe(false)
  })

  it('normalizes profile input and generates a health URL when enabled', () => {
    const profile = buildDefaultLocalModelTunnelProfile(
      '2026-01-01T00:00:00.000Z',
    )
    const next = applyLocalModelTunnelProfileInput(
      profile,
      {
        name: '  GPU  ',
        connectionKind: 'ssh-tunnel',
        allowExternal: true,
        localPort: 11435,
        healthCheckEnabled: true,
        healthCheckUrl: '',
      },
      '2026-01-02T00:00:00.000Z',
    )

    expect(next.name).toBe('GPU')
    expect(next.connectionKind).toBe('ssh-tunnel')
    expect(next.allowExternal).toBe(true)
    expect(next.localPort).toBe(11435)
    expect(next.healthCheckUrl).toBe('http://127.0.0.1:11435/api/tags')
    expect(next.updatedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('rejects ssh fields that would be parsed as ssh options', () => {
    const profile = {
      ...buildDefaultLocalModelTunnelProfile('2026-01-01T00:00:00.000Z'),
      connectionKind: 'ssh-tunnel' as const,
      sshTarget: 'gpu-box',
      localBindHost: '127.0.0.1',
      remoteHost: '127.0.0.1',
    }
    const next = applyLocalModelTunnelProfileInput(profile, {
      sshTarget: '-oProxyCommand=sh',
      localBindHost: '-bad-local-host',
      remoteHost: '-bad-remote-host',
    })

    expect(next.sshTarget).toBe('gpu-box')
    expect(next.localBindHost).toBe('127.0.0.1')
    expect(next.remoteHost).toBe('127.0.0.1')
  })
})

function createAutoRouteProfile(): LocalModelTunnelProfile {
  return {
    ...buildDefaultLocalModelTunnelProfile('2026-01-01T00:00:00.000Z'),
    id: 'user-configured-pgx',
    name: 'little monster PGX',
    connectionKind: 'ssh-tunnel',
    sshTarget: 'little-monster',
    allowExternal: true,
    autoStart: true,
    localPort: 11436,
    remoteHost: '127.0.0.1',
    remotePort: 11434,
    healthCheckUrl: 'http://127.0.0.1:11436/api/tags',
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
  }
}
