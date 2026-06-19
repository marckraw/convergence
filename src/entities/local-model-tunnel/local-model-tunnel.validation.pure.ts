import type { LocalModelTunnelProfileInput } from './local-model-tunnel.types'

export interface LocalModelTunnelProfileWarning {
  code: 'health-port-mismatch' | 'remote-host-localhost-bound-runtime'
  message: string
}

export function selectLocalModelTunnelProfileWarnings(
  input: LocalModelTunnelProfileInput,
): LocalModelTunnelProfileWarning[] {
  const warnings: LocalModelTunnelProfileWarning[] = []

  if (hasHealthPortMismatch(input)) {
    warnings.push({
      code: 'health-port-mismatch',
      message: 'Health URL port does not match local tunnel port.',
    })
  }

  if (hasRemoteHostLocalhostBoundRuntimeWarning(input)) {
    warnings.push({
      code: 'remote-host-localhost-bound-runtime',
      message:
        'For localhost-bound Ollama runtimes, remote host should usually be 127.0.0.1 because SSH resolves it on the remote machine.',
    })
  }

  return warnings
}

function hasHealthPortMismatch(input: LocalModelTunnelProfileInput): boolean {
  const profileMismatch =
    !!input.healthCheckEnabled &&
    !!input.healthCheckUrl &&
    !!input.localPort &&
    hasUrlPortMismatch(input.healthCheckUrl, input.localPort)
  const routeMismatch = (input.routeCandidates ?? []).some(
    (route) =>
      !!route.healthCheckUrl &&
      hasUrlPortMismatch(route.healthCheckUrl, route.localPort),
  )
  return profileMismatch || routeMismatch
}

function hasRemoteHostLocalhostBoundRuntimeWarning(
  input: LocalModelTunnelProfileInput,
): boolean {
  const candidates = [
    {
      sshTarget: input.sshTarget,
      remoteHost: input.remoteHost,
      remotePort: input.remotePort,
      healthCheckUrl: input.healthCheckUrl,
    },
    ...(input.routeCandidates ?? []),
  ]

  return candidates.some(
    ({ sshTarget, remoteHost, remotePort, healthCheckUrl }) => {
      if (!remoteHost) return false
      if (remoteHost === '127.0.0.1' || remoteHost === 'localhost') return false
      if (remoteHost === sshTarget) return true
      return remotePort === 11434 && isOllamaHealthUrl(healthCheckUrl)
    },
  )
}

function parseUrlPort(value: string): number | null {
  try {
    const url = new URL(value)
    const port = url.port
    if (!port) return url.protocol === 'https:' ? 443 : 80
    const parsed = Number(port)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function hasUrlPortMismatch(url: string, localPort: number): boolean {
  const urlPort = parseUrlPort(url)
  return urlPort !== null && urlPort !== localPort
}

function isOllamaHealthUrl(value: unknown): boolean {
  return typeof value === 'string' && value.includes('/api/tags')
}
