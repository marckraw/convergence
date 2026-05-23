import type {
  LocalModelTunnelCommand,
  LocalModelTunnelProfile,
  LocalModelTunnelProfileInput,
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
    name: 'Local model tunnel',
    sshTarget: 'my-gpu-host',
    autoStart: false,
    useCustomLocalBindHost: false,
    localBindHost: DEFAULT_LOCAL_BIND_HOST,
    localPort: DEFAULT_PORT,
    remoteHost: DEFAULT_REMOTE_HOST,
    remotePort: DEFAULT_PORT,
    healthCheckEnabled: true,
    healthCheckUrl: `http://${DEFAULT_LOCAL_BIND_HOST}:${DEFAULT_PORT}/api/tags`,
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
    sshTarget: pickSafeSshValue(raw.sshTarget, fallback.sshTarget),
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
    sshTarget:
      typeof input.sshTarget === 'string'
        ? pickSafeSshValue(input.sshTarget, profile.sshTarget)
        : profile.sshTarget,
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
): LocalModelTunnelCommand {
  const localBindHost = getEffectiveLocalBindHost(profile)
  const forward = `${localBindHost}:${profile.localPort}:${profile.remoteHost}:${profile.remotePort}`
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
    '-L',
    forward,
    '--',
    profile.sshTarget,
  ]

  return {
    binary: 'ssh',
    args,
    preview: ['ssh', ...args].join(' '),
  }
}

export function getEffectiveLocalBindHost(
  profile: LocalModelTunnelProfile,
): string {
  return profile.useCustomLocalBindHost
    ? profile.localBindHost
    : DEFAULT_LOCAL_BIND_HOST
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
