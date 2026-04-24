export type McpServerScope = 'global' | 'project'

export type McpServerStatus =
  | 'ready'
  | 'needs-auth'
  | 'failed'
  | 'disabled'
  | 'unknown'

export type McpTransportType =
  | 'stdio'
  | 'http'
  | 'sse'
  | 'streamable_http'
  | 'unknown'

export interface McpServerSummary {
  name: string
  providerId: string
  providerName: string
  scope: McpServerScope
  scopeLabel: string
  status: McpServerStatus
  statusLabel: string
  transportType: McpTransportType
  description: string
  enabled: boolean | null
}

export interface ProviderMcpVisibility {
  providerId: string
  providerName: string
  globalServers: McpServerSummary[]
  projectServers: McpServerSummary[]
  error: string | null
  note?: string | null
}

export interface ProjectMcpVisibility {
  projectId: string
  projectName: string
  providers: ProviderMcpVisibility[]
}
