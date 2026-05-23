export type LocalModelTunnelState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'external'
  | 'failed'

export interface LocalModelTunnelProfile {
  id: string
  name: string
  sshTarget: string
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
  sshTarget?: string
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
