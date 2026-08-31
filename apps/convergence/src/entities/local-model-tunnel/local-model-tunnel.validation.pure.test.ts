import { describe, expect, it } from 'vitest'
import { selectLocalModelTunnelProfileWarnings } from './local-model-tunnel.validation.pure'

describe('local model tunnel validation', () => {
  it('warns when the health URL port does not match the local tunnel port', () => {
    expect(
      selectLocalModelTunnelProfileWarnings({
        connectionKind: 'ssh-tunnel',
        sshTarget: 'little-monster',
        localPort: 11436,
        remoteHost: '127.0.0.1',
        remotePort: 11434,
        healthCheckEnabled: true,
        healthCheckUrl: 'http://127.0.0.1:11435/api/tags',
      }),
    ).toContainEqual({
      code: 'health-port-mismatch',
      message: 'Health URL port does not match local tunnel port.',
    })
  })

  it('warns when a route health URL port does not match the route local port', () => {
    expect(
      selectLocalModelTunnelProfileWarnings({
        connectionKind: 'ssh-tunnel',
        localPort: 11436,
        remoteHost: '127.0.0.1',
        remotePort: 11434,
        healthCheckEnabled: true,
        healthCheckUrl: 'http://127.0.0.1:11436/api/tags',
        routeCandidates: [
          {
            id: 'route-1',
            label: 'Route 1',
            sshTarget: 'gpu-box',
            useCustomLocalBindHost: false,
            localBindHost: '127.0.0.1',
            localPort: 11436,
            remoteHost: '127.0.0.1',
            remotePort: 11434,
            healthCheckUrl: 'http://127.0.0.1:11435/api/tags',
            connectTimeoutSeconds: 5,
          },
        ],
      }),
    ).toContainEqual({
      code: 'health-port-mismatch',
      message: 'Health URL port does not match local tunnel port.',
    })
  })

  it('warns when an Ollama route forwards to the ssh target instead of remote localhost', () => {
    expect(
      selectLocalModelTunnelProfileWarnings({
        connectionKind: 'ssh-tunnel',
        sshTarget: 'little-monster-ts',
        localPort: 11436,
        remoteHost: 'little-monster-ts',
        remotePort: 11434,
        healthCheckEnabled: true,
        healthCheckUrl: 'http://127.0.0.1:11436/api/tags',
      }),
    ).toContainEqual({
      code: 'remote-host-localhost-bound-runtime',
      message:
        'For localhost-bound Ollama runtimes, remote host should usually be 127.0.0.1 because SSH resolves it on the remote machine.',
    })
  })

  it('warns when an Ollama route candidate uses a remote network address instead of remote localhost', () => {
    expect(
      selectLocalModelTunnelProfileWarnings({
        connectionKind: 'ssh-tunnel',
        localPort: 11436,
        remoteHost: '127.0.0.1',
        remotePort: 11434,
        healthCheckEnabled: true,
        healthCheckUrl: 'http://127.0.0.1:11436/api/tags',
        routeCandidates: [
          {
            id: 'tailscale',
            label: 'Connected via Tailscale',
            sshTarget: 'little-monster-ts',
            useCustomLocalBindHost: false,
            localBindHost: '127.0.0.1',
            localPort: 11436,
            remoteHost: '100.121.208.49',
            remotePort: 11434,
            healthCheckUrl: 'http://127.0.0.1:11436/api/tags',
            connectTimeoutSeconds: 8,
          },
        ],
      }),
    ).toContainEqual({
      code: 'remote-host-localhost-bound-runtime',
      message:
        'For localhost-bound Ollama runtimes, remote host should usually be 127.0.0.1 because SSH resolves it on the remote machine.',
    })
  })
})
