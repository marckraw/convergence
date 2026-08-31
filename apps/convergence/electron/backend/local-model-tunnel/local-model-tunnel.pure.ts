import type {
  LocalModelTunnelCommand,
  LocalModelTunnelConnectionKind,
  LocalModelTunnelProfile,
  LocalModelTunnelProfileInput,
  LocalModelTunnelRouteCandidate,
} from './local-model-tunnel.types'

export const LOCAL_MODEL_TUNNEL_PROFILES_KEY = 'local_model_tunnel_profiles_v1'

const DEFAULT_LOCAL_BIND_HOST = '127.0.0.1'
const DEFAULT_REMOTE_HOST = '127.0.0.1'
const DEFAULT_PORT = 11434

export function buildDefaultLocalModelTunnelProfile(
  now = new Date().toISOString(),
): LocalModelTunnelProfile {
  return {
    id: 'local-model-tunnel',
    name: 'Local Ollama',
    connectionKind: 'local-runtime',
    sshTarget: 'my-gpu-host',
    allowExternal: false,
    autoStart: false,
    useCustomLocalBindHost: false,
    localBindHost: DEFAULT_LOCAL_BIND_HOST,
    localPort: DEFAULT_PORT,
    remoteHost: DEFAULT_REMOTE_HOST,
    remotePort: DEFAULT_PORT,
    healthCheckEnabled: true,
    healthCheckUrl: `http://${DEFAULT_LOCAL_BIND_HOST}:${DEFAULT_PORT}/api/tags`,
    routeCandidates: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeLocalModelTunnelProfile(
  value: unknown,
  fallback: LocalModelTunnelProfile,
): LocalModelTunnelProfile {
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Partial<LocalModelTunnelProfile>
  return {
    id: pickNonEmptyString(raw.id, fallback.id),
    name: pickNonEmptyString(raw.name, fallback.name),
    connectionKind: pickConnectionKind(raw.connectionKind, 'ssh-tunnel'),
    sshTarget: pickSafeSshValue(raw.sshTarget, fallback.sshTarget),
    allowExternal:
      typeof raw.allowExternal === 'boolean' ? raw.allowExternal : false,
    autoStart: typeof raw.autoStart === 'boolean' ? raw.autoStart : false,
    useCustomLocalBindHost:
      typeof raw.useCustomLocalBindHost === 'boolean'
        ? raw.useCustomLocalBindHost
        : false,
    localBindHost: pickSafeSshValue(raw.localBindHost, DEFAULT_LOCAL_BIND_HOST),
    localPort: normalizePort(raw.localPort, fallback.localPort),
    remoteHost: pickSafeSshValue(raw.remoteHost, fallback.remoteHost),
    remotePort: normalizePort(raw.remotePort, fallback.remotePort),
    healthCheckEnabled:
      typeof raw.healthCheckEnabled === 'boolean'
        ? raw.healthCheckEnabled
        : fallback.healthCheckEnabled,
    healthCheckUrl:
      typeof raw.healthCheckUrl === 'string' ? raw.healthCheckUrl.trim() : '',
    routeCandidates: normalizeRouteCandidates(raw.routeCandidates, fallback),
    createdAt: pickNonEmptyString(raw.createdAt, fallback.createdAt),
    updatedAt: pickNonEmptyString(raw.updatedAt, fallback.updatedAt),
  }
}

export function parseLocalModelTunnelProfiles(
  raw: string | null,
): LocalModelTunnelProfile[] {
  const fallback = buildDefaultLocalModelTunnelProfile()
  if (!raw) return [fallback]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [fallback]
    const profiles = parsed.map((value, index) =>
      normalizeLocalModelTunnelProfile(value, {
        ...fallback,
        id: index === 0 ? fallback.id : `${fallback.id}-${index + 1}`,
      }),
    )
    return profiles.length > 0 ? profiles : [fallback]
  } catch {
    return [fallback]
  }
}

export function applyLocalModelTunnelProfileInput(
  profile: LocalModelTunnelProfile,
  input: LocalModelTunnelProfileInput,
  now = new Date().toISOString(),
): LocalModelTunnelProfile {
  const next: LocalModelTunnelProfile = {
    ...profile,
    name:
      typeof input.name === 'string' && input.name.trim()
        ? input.name.trim()
        : profile.name,
    connectionKind:
      input.connectionKind === 'local-runtime' ||
      input.connectionKind === 'ssh-tunnel'
        ? input.connectionKind
        : profile.connectionKind,
    sshTarget:
      typeof input.sshTarget === 'string'
        ? pickSafeSshValue(input.sshTarget, profile.sshTarget)
        : profile.sshTarget,
    allowExternal:
      typeof input.allowExternal === 'boolean'
        ? input.allowExternal
        : profile.allowExternal,
    autoStart:
      typeof input.autoStart === 'boolean'
        ? input.autoStart
        : profile.autoStart,
    useCustomLocalBindHost:
      typeof input.useCustomLocalBindHost === 'boolean'
        ? input.useCustomLocalBindHost
        : profile.useCustomLocalBindHost,
    localBindHost:
      typeof input.localBindHost === 'string'
        ? pickSafeSshValue(input.localBindHost, profile.localBindHost)
        : profile.localBindHost,
    localPort: normalizePort(input.localPort, profile.localPort),
    remoteHost:
      typeof input.remoteHost === 'string'
        ? pickSafeSshValue(input.remoteHost, profile.remoteHost)
        : profile.remoteHost,
    remotePort: normalizePort(input.remotePort, profile.remotePort),
    healthCheckEnabled:
      typeof input.healthCheckEnabled === 'boolean'
        ? input.healthCheckEnabled
        : profile.healthCheckEnabled,
    healthCheckUrl:
      typeof input.healthCheckUrl === 'string'
        ? input.healthCheckUrl.trim()
        : profile.healthCheckUrl,
    routeCandidates: Array.isArray(input.routeCandidates)
      ? normalizeRouteCandidates(input.routeCandidates, profile)
      : profile.routeCandidates,
    updatedAt: now,
  }

  if (!next.healthCheckUrl && next.healthCheckEnabled) {
    const localHost = getEffectiveLocalBindHost(next)
    next.healthCheckUrl = `http://${localHost}:${next.localPort}/api/tags`
  }

  return next
}

export function buildLocalModelTunnelCommand(
  profile: LocalModelTunnelProfile,
  route = getDefaultLocalModelTunnelRoute(profile),
): LocalModelTunnelCommand {
  const localBindHost = getEffectiveRouteLocalBindHost(route)
  const forward = `${localBindHost}:${route.localPort}:${route.remoteHost}:${route.remotePort}`
  const args = [
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
    ...buildConnectTimeoutArgs(route),
    '-L',
    forward,
    '--',
    route.sshTarget,
  ]

  return {
    binary: 'ssh',
    args,
    preview: ['ssh', ...args].join(' '),
  }
}

export function getLocalModelTunnelRoutes(
  profile: LocalModelTunnelProfile,
): LocalModelTunnelRouteCandidate[] {
  return profile.routeCandidates.length > 0
    ? profile.routeCandidates
    : [getSingleLocalModelTunnelRoute(profile)]
}

export function getDefaultLocalModelTunnelRoute(
  profile: LocalModelTunnelProfile,
): LocalModelTunnelRouteCandidate {
  return getLocalModelTunnelRoutes(profile)[0]!
}

export function getRouteEffectiveHealthCheckUrl(
  profile: LocalModelTunnelProfile,
  route: LocalModelTunnelRouteCandidate,
): string {
  return route.healthCheckUrl || profile.healthCheckUrl
}

export function getEffectiveLocalBindHost(
  profile: LocalModelTunnelProfile,
): string {
  return profile.useCustomLocalBindHost
    ? profile.localBindHost
    : DEFAULT_LOCAL_BIND_HOST
}

export function getEffectiveRouteLocalBindHost(
  route: LocalModelTunnelRouteCandidate,
): string {
  return route.useCustomLocalBindHost
    ? route.localBindHost
    : DEFAULT_LOCAL_BIND_HOST
}

function pickConnectionKind(
  value: unknown,
  fallback: LocalModelTunnelConnectionKind,
): LocalModelTunnelConnectionKind {
  return value === 'local-runtime' || value === 'ssh-tunnel' ? value : fallback
}

function pickNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function pickSafeSshValue(value: unknown, fallback: string): string {
  const text = pickNonEmptyString(value, fallback)
  return text.startsWith('-') ? fallback : text
}

function normalizePort(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const port = Math.floor(value)
  if (port < 1 || port > 65535) return fallback
  return port
}

function getSingleLocalModelTunnelRoute(
  profile: LocalModelTunnelProfile,
): LocalModelTunnelRouteCandidate {
  return {
    id: 'primary',
    label: 'SSH tunnel',
    sshTarget: profile.sshTarget,
    useCustomLocalBindHost: profile.useCustomLocalBindHost,
    localBindHost: profile.localBindHost,
    localPort: profile.localPort,
    remoteHost: profile.remoteHost,
    remotePort: profile.remotePort,
    healthCheckUrl: profile.healthCheckUrl,
    connectTimeoutSeconds: null,
  }
}

function normalizeRouteCandidates(
  value: unknown,
  fallback: LocalModelTunnelProfile,
): LocalModelTunnelRouteCandidate[] {
  if (!Array.isArray(value)) return []
  return value
    .map((route, index) => normalizeRouteCandidate(route, fallback, index))
    .filter((route): route is LocalModelTunnelRouteCandidate => route !== null)
}

function normalizeRouteCandidate(
  value: unknown,
  fallback: LocalModelTunnelProfile,
  index: number,
): LocalModelTunnelRouteCandidate | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<LocalModelTunnelRouteCandidate>
  const id = pickNonEmptyString(raw.id, `route-${index + 1}`)
  return {
    id,
    label: pickNonEmptyString(raw.label, `Route ${index + 1}`),
    sshTarget: pickSafeSshValue(raw.sshTarget, fallback.sshTarget),
    useCustomLocalBindHost:
      typeof raw.useCustomLocalBindHost === 'boolean'
        ? raw.useCustomLocalBindHost
        : fallback.useCustomLocalBindHost,
    localBindHost: pickSafeSshValue(raw.localBindHost, fallback.localBindHost),
    localPort: normalizePort(raw.localPort, fallback.localPort),
    remoteHost: pickSafeSshValue(raw.remoteHost, fallback.remoteHost),
    remotePort: normalizePort(raw.remotePort, fallback.remotePort),
    healthCheckUrl:
      typeof raw.healthCheckUrl === 'string'
        ? raw.healthCheckUrl.trim()
        : fallback.healthCheckUrl,
    connectTimeoutSeconds: normalizeConnectTimeoutSeconds(
      raw.connectTimeoutSeconds,
    ),
  }
}

function normalizeConnectTimeoutSeconds(value: unknown): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const seconds = Math.floor(value)
  if (seconds < 1 || seconds > 120) return null
  return seconds
}

function buildConnectTimeoutArgs(
  route: LocalModelTunnelRouteCandidate,
): string[] {
  return route.connectTimeoutSeconds === null
    ? []
    : ['-o', `ConnectTimeout=${route.connectTimeoutSeconds}`]
}
