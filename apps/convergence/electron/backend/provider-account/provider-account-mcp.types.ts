import type { McpServerStatus } from '../mcp/mcp.types'

export interface ProviderAccountConnector {
  name: string
  status: McpServerStatus
  statusLabel: string
  description: string
  needsAuthorization: boolean
}

export interface ProviderAccountConnectorsResult {
  providerAccountId: string | null
  connectors: ProviderAccountConnector[]
  /** A read error, or an action refusal accompanying the refreshed list. */
  error: string | null
}
