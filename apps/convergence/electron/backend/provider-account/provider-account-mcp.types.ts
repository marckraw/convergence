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
  /**
   * Claude servers whose stale "needs sign-in" note this read removed, so new
   * conversations stop skipping them (MAR-3517). Absent outside that read.
   */
  clearedNeedsAuthNotes?: string[]
}
