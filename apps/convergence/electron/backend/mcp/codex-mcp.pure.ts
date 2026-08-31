import {
  CODEX_MCP_PROVIDER_ID,
  CODEX_MCP_PROVIDER_NAME,
  CODEX_MCP_UNKNOWN_DESCRIPTION,
} from './codex-mcp.constants'
import type {
  McpServerScope,
  McpServerStatus,
  McpServerSummary,
  McpTransportType,
} from './mcp.types'

export interface CodexTransportRecord {
  type?: unknown
  url?: unknown
  command?: unknown
  args?: unknown
}

export interface CodexServerRecord {
  name?: unknown
  enabled?: unknown
  disabled_reason?: unknown
  transport?: CodexTransportRecord
  startup_timeout_sec?: unknown
  tool_timeout_sec?: unknown
  enabled_tools?: unknown
  disabled_tools?: unknown
}

export function parseCodexServers(stdout: string): CodexServerRecord[] {
  const parsed = JSON.parse(stdout) as unknown
  return Array.isArray(parsed) ? (parsed as CodexServerRecord[]) : []
}

export function normalizeTransportType(type: unknown): McpTransportType {
  switch (type) {
    case 'stdio':
      return 'stdio'
    case 'http':
      return 'http'
    case 'sse':
      return 'sse'
    case 'streamable_http':
      return 'streamable_http'
    default:
      return 'unknown'
  }
}

export function normalizeCodexStatus(
  enabled: boolean,
  disabledReason: string | null,
): { status: McpServerStatus; statusLabel: string } {
  if (!enabled) {
    return {
      status: 'disabled',
      statusLabel: disabledReason ?? 'Disabled',
    }
  }

  if (disabledReason) {
    return {
      status: 'disabled',
      statusLabel: disabledReason,
    }
  }

  return {
    status: 'ready',
    statusLabel: 'Configured',
  }
}

export function toSummary(
  record: CodexServerRecord,
  scope: McpServerScope,
  scopeLabel: string,
): McpServerSummary | null {
  const name = typeof record.name === 'string' ? record.name : null
  if (!name) {
    return null
  }

  const enabled = record.enabled !== false
  const disabledReason =
    typeof record.disabled_reason === 'string' ? record.disabled_reason : null
  const transport = record.transport ?? {}
  const status = normalizeCodexStatus(enabled, disabledReason)
  const command =
    typeof transport.command === 'string' ? transport.command : null
  const args = Array.isArray(transport.args)
    ? transport.args.filter((arg): arg is string => typeof arg === 'string')
    : []
  const url = typeof transport.url === 'string' ? transport.url : null
  const fallbackDescription = [command, ...args].filter(Boolean).join(' ')
  const description = url ?? fallbackDescription

  return {
    name,
    providerId: CODEX_MCP_PROVIDER_ID,
    providerName: CODEX_MCP_PROVIDER_NAME,
    scope,
    scopeLabel,
    status: status.status,
    statusLabel: status.statusLabel,
    transportType: normalizeTransportType(transport.type),
    description: description || CODEX_MCP_UNKNOWN_DESCRIPTION,
    enabled,
  }
}

export function getIdentity(record: CodexServerRecord): string {
  return JSON.stringify({
    enabled: record.enabled ?? true,
    disabledReason:
      typeof record.disabled_reason === 'string'
        ? record.disabled_reason
        : null,
    transport: record.transport ?? null,
    startupTimeoutSec: record.startup_timeout_sec ?? null,
    toolTimeoutSec: record.tool_timeout_sec ?? null,
    enabledTools: record.enabled_tools ?? null,
    disabledTools: record.disabled_tools ?? null,
  })
}
