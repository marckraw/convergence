export type LocalModelTunnelState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'external'
  | 'failed'

export type LocalModelTunnelConnectionKind = 'local-runtime' | 'ssh-tunnel'

export type LocalModelTunnelProbeKind = 'http' | 'tcp'

export type LocalModelTunnelHealthState = 'unknown' | 'healthy' | 'unhealthy'

export interface LocalModelTunnelHealthStatus {
  state: LocalModelTunnelHealthState
  probeKind: LocalModelTunnelProbeKind | null
  checkedAt: string | null
  latencyMs: number | null
  statusCode: number | null
  modelCount: number | null
  error: string | null
}

export interface LocalModelTunnelProfile {
  id: string
  name: string
  connectionKind: LocalModelTunnelConnectionKind
  sshTarget: string
  allowExternal: boolean
  autoStart: boolean
  useCustomLocalBindHost: boolean
  localBindHost: string
  localPort: number
  remoteHost: string
  remotePort: number
  healthCheckEnabled: boolean
  healthCheckUrl: string
  createdAt: string
  updatedAt: string
}

export interface LocalModelTunnelProfileInput {
  name?: string
  connectionKind?: LocalModelTunnelConnectionKind
  sshTarget?: string
  allowExternal?: boolean
  autoStart?: boolean
  useCustomLocalBindHost?: boolean
  localBindHost?: string
  localPort?: number
  remoteHost?: string
  remotePort?: number
  healthCheckEnabled?: boolean
  healthCheckUrl?: string
}

export interface LocalModelTunnelRuntimeStatus {
  profileId: string
  state: LocalModelTunnelState
  managed: boolean
  pid: number | null
  error: string | null
  lastCheckedAt: string | null
  health: LocalModelTunnelHealthStatus
  commandPreview: string
}

export interface LocalModelTunnelProfileWithStatus {
  profile: LocalModelTunnelProfile
  status: LocalModelTunnelRuntimeStatus
}

export interface LocalModelTunnelSnapshot {
  profiles: LocalModelTunnelProfileWithStatus[]
  updatedAt: string
}

export interface LocalModelTunnelCommand {
  binary: 'ssh'
  args: string[]
  preview: string
}

export type LocalModelTunnelEventEmitter = (
  snapshot: LocalModelTunnelSnapshot,
) => void
