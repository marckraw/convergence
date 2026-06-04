import {
  ANTIGRAVITY_MCP_PROVIDER_ID,
  ANTIGRAVITY_MCP_PROVIDER_NAME,
  ANTIGRAVITY_MCP_UNKNOWN_DESCRIPTION,
} from './antigravity-mcp.constants'
import type {
  McpServerScope,
  McpServerSummary,
  McpTransportType,
} from './mcp.types'

export interface AntigravityMcpServerRecord {
  command?: unknown
  args?: unknown
  url?: unknown
  serverUrl?: unknown
  httpUrl?: unknown
  env?: unknown
  disabled?: unknown
  enabled?: unknown
}

export interface AntigravityMcpServerWithSource {
  name: string
  record: AntigravityMcpServerRecord
  scope: McpServerScope
  scopeLabel: string
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function extractMcpServerRecords(
  value: unknown,
): Record<string, AntigravityMcpServerRecord> {
  if (!isRecord(value)) {
    return {}
  }

  const rawServers = value.mcpServers ?? value['mcp-servers']
  if (!isRecord(rawServers)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(rawServers).filter(
      (entry): entry is [string, AntigravityMcpServerRecord] =>
        isRecord(entry[1]),
    ),
  )
}

export function normalizeAntigravityTransportType(
  record: AntigravityMcpServerRecord,
): McpTransportType {
  if (typeof record.command === 'string') {
    return 'stdio'
  }

  const remoteUrl = getAntigravityRemoteUrl(record)
  if (remoteUrl) {
    return /\/sse(?:$|[/?#])/i.test(remoteUrl) ? 'sse' : 'streamable_http'
  }

  return 'unknown'
}

export function getAntigravityRemoteUrl(
  record: AntigravityMcpServerRecord,
): string | null {
  for (const candidate of [record.serverUrl, record.url, record.httpUrl]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate
    }
  }

  return null
}

export function getAntigravityDescription(
  record: AntigravityMcpServerRecord,
): string {
  const remoteUrl = getAntigravityRemoteUrl(record)
  if (remoteUrl) {
    return remoteUrl
  }

  const command = typeof record.command === 'string' ? record.command : null
  const args = Array.isArray(record.args)
    ? record.args.filter((arg): arg is string => typeof arg === 'string')
    : []
  const description = [command, ...args].filter(Boolean).join(' ')

  return description || ANTIGRAVITY_MCP_UNKNOWN_DESCRIPTION
}

export function isAntigravityDisabled(
  record: AntigravityMcpServerRecord,
): boolean {
  return record.enabled === false || record.disabled === true
}

export function toAntigravitySummary({
  name,
  record,
  scope,
  scopeLabel,
}: AntigravityMcpServerWithSource): McpServerSummary {
  const disabled = isAntigravityDisabled(record)

  return {
    name,
    providerId: ANTIGRAVITY_MCP_PROVIDER_ID,
    providerName: ANTIGRAVITY_MCP_PROVIDER_NAME,
    scope,
    scopeLabel,
    status: disabled ? 'disabled' : 'unknown',
    statusLabel: disabled ? 'Disabled' : 'Configured',
    transportType: normalizeAntigravityTransportType(record),
    description: getAntigravityDescription(record),
    enabled: !disabled,
  }
}

export function groupAntigravitySummaries(
  servers: AntigravityMcpServerWithSource[],
): {
  globalServers: McpServerSummary[]
  projectServers: McpServerSummary[]
} {
  const summaries = servers.map((server) => toAntigravitySummary(server))

  return {
    globalServers: summaries.filter((server) => server.scope === 'global'),
    projectServers: summaries.filter((server) => server.scope === 'project'),
  }
}
