import { describe, expect, it } from 'vitest'
import {
  applyLocalModelTunnelProfileInput,
  buildDefaultLocalModelTunnelProfile,
  buildLocalModelTunnelCommand,
  parseLocalModelTunnelProfiles,
} from './local-model-tunnel.pure'

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
