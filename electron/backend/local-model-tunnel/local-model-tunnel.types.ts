export type LocalModelTunnelState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'external'
  | 'failed'

export type LocalModelTunnelConnectionKind = 'local-runtime' | 'ssh-tunnel'

export type LocalModelTunnelProbeKind = 'http' | 'tcp'

export type LocalModelTunnelHealthState = 'unknown' | 'healthy' | 'unhealthy'

export type LocalModelTunnelHealthFailureKind =
  | 'invalid-url'
  | 'timeout'
  | 'connection-refused'
  | 'connection-reset'
  | 'network-error'
  | 'non-200'
  | 'invalid-json'
  | 'not-ollama-json'

export interface LocalModelTunnelHealthStatus {
  state: LocalModelTunnelHealthState
  probeKind: LocalModelTunnelProbeKind | null
  checkedAt: string | null
  latencyMs: number | null
  statusCode: number | null
  modelCount: number | null
  modelNames: string[] | null
  isOllama: boolean | null
  failureKind: LocalModelTunnelHealthFailureKind | null
  error: string | null
}

export interface LocalModelTunnelRouteCandidate {
  id: string
  label: string
  sshTarget: string
  useCustomLocalBindHost: boolean
  localBindHost: string
  localPort: number
  remoteHost: string
  remotePort: number
  healthCheckUrl: string
  connectTimeoutSeconds: number | null
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
  routeCandidates: LocalModelTunnelRouteCandidate[]
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
  routeCandidates?: LocalModelTunnelRouteCandidate[]
}

export interface LocalModelTunnelDiagnostic {
  label: string
  value: string
}

export interface LocalModelTunnelRuntimeStatus {
  profileId: string
  state: LocalModelTunnelState
  managed: boolean
  pid: number | null
  error: string | null
  lastCheckedAt: string | null
  health: LocalModelTunnelHealthStatus
  activeRouteId: string | null
  activeRouteLabel: string | null
  diagnostics: LocalModelTunnelDiagnostic[]
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
