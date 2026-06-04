import { dirname, join, resolve } from 'path'
import {
  ANTIGRAVITY_MCP_GLOBAL_SCOPE_LABEL,
  ANTIGRAVITY_MCP_LEGACY_GLOBAL_SCOPE_LABEL,
  ANTIGRAVITY_MCP_PROJECT_SCOPE_LABEL,
  ANTIGRAVITY_MCP_PROVIDER_ID,
  ANTIGRAVITY_MCP_PROVIDER_NAME,
  ANTIGRAVITY_MCP_UNKNOWN_DESCRIPTION,
} from './antigravity-mcp.constants'
import {
  extractMcpServerRecords,
  type McpConfigPathSource,
} from './mcp-config.pure'
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

export type AntigravityMcpConfigSource = McpConfigPathSource

export function buildAntigravityGlobalConfigSources(
  homeDir: string,
): AntigravityMcpConfigSource[] {
  return [
    {
      path: join(homeDir, '.gemini', 'settings.json'),
      scope: 'global',
      scopeLabel: ANTIGRAVITY_MCP_LEGACY_GLOBAL_SCOPE_LABEL,
    },
    {
      path: join(homeDir, '.gemini', 'config', 'mcp_config.json'),
      scope: 'global',
      scopeLabel: ANTIGRAVITY_MCP_GLOBAL_SCOPE_LABEL,
    },
  ]
}

export function collectAncestorAntigravityMcpConfigSources(
  projectPath: string,
): AntigravityMcpConfigSource[] {
  const sources: AntigravityMcpConfigSource[] = []
  let current = resolve(projectPath)

  for (;;) {
    sources.push({
      path: join(current, '.agents', 'mcp_config.json'),
      scope: 'project',
      scopeLabel: ANTIGRAVITY_MCP_PROJECT_SCOPE_LABEL,
    })

    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  return sources.reverse()
}

export function mergeAntigravityConfiguredServers(
  entries: Array<{
    source: AntigravityMcpConfigSource
    config: Record<string, unknown> | null
  }>,
): AntigravityMcpServerWithSource[] {
  const byName = new Map<string, AntigravityMcpServerWithSource>()

  for (const { source, config } of entries) {
    if (!config) {
      continue
    }

    const records = extractMcpServerRecords<AntigravityMcpServerRecord>(config)
    for (const [name, record] of Object.entries(records)) {
      byName.set(name, {
        name,
        record,
        scope: source.scope,
        scopeLabel: source.scopeLabel,
      })
    }
  }

  return Array.from(byName.values())
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
