import {
  CURSOR_MCP_GLOBAL_SCOPE_LABEL,
  CURSOR_MCP_PROJECT_SCOPE_LABEL,
  CURSOR_MCP_PROVIDER_ID,
  CURSOR_MCP_PROVIDER_NAME,
  CURSOR_MCP_UNKNOWN_DESCRIPTION,
} from './cursor-mcp.constants'
import {
  buildMcpConfigScopeSets,
  extractMcpServerRecords,
} from './mcp-config.pure'
import type {
  McpServerScope,
  McpServerStatus,
  McpServerSummary,
  McpTransportType,
} from './mcp.types'

export interface CursorMcpServerRecord {
  command?: unknown
  args?: unknown
  url?: unknown
  headers?: unknown
  env?: unknown
}

export interface CursorListEntry {
  name: string
  statusText: string
}

export interface CursorMcpConfigScopes {
  globalServerNames: Set<string>
  projectServerNames: Set<string>
  globalRecords: Record<string, CursorMcpServerRecord>
  projectRecords: Record<string, CursorMcpServerRecord>
}

export function buildCursorConfigScopes(
  globalConfig: Record<string, unknown> | null,
  projectConfig: Record<string, unknown> | null,
): CursorMcpConfigScopes {
  const globalRecords =
    extractMcpServerRecords<CursorMcpServerRecord>(globalConfig)
  const projectRecords =
    extractMcpServerRecords<CursorMcpServerRecord>(projectConfig)
  const scopeSets = buildMcpConfigScopeSets(globalRecords, projectRecords)

  return {
    ...scopeSets,
    globalRecords,
    projectRecords,
  }
}

export function parseCursorListEntries(stdout: string): CursorListEntry[] {
  return stdout.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      return []
    }

    const match = trimmed.match(/^(.+?):\s+(.+)$/)
    if (!match) {
      return []
    }

    const name = match[1]?.trim()
    const statusText = match[2]?.trim()
    if (!name || !statusText) {
      return []
    }

    return [{ name, statusText }]
  })
}

export function mapCursorStatus(statusText: string): {
  status: McpServerStatus
  statusLabel: string
} {
  const lower = statusText.toLowerCase()

  if (
    lower.includes('needs approval') ||
    lower.includes('needs authentication') ||
    lower.includes('needs auth')
  ) {
    return { status: 'needs-auth', statusLabel: statusText }
  }

  if (lower.includes('disabled')) {
    return { status: 'disabled', statusLabel: statusText }
  }

  if (lower.includes('failed') || lower.includes('error')) {
    return { status: 'failed', statusLabel: statusText }
  }

  if (lower.includes('not loaded')) {
    return { status: 'unknown', statusLabel: statusText }
  }

  if (lower.includes('loaded') || lower.includes('connected')) {
    return { status: 'ready', statusLabel: statusText }
  }

  return { status: 'unknown', statusLabel: statusText }
}

export function normalizeCursorTransportType(
  record: CursorMcpServerRecord | null,
): McpTransportType {
  if (!record) {
    return 'unknown'
  }

  if (typeof record.command === 'string') {
    return 'stdio'
  }

  if (typeof record.url === 'string') {
    return /\/sse(?:$|[/?#])/i.test(record.url) ? 'sse' : 'http'
  }

  return 'unknown'
}

export function getCursorDescription(
  record: CursorMcpServerRecord | null,
): string {
  if (!record) {
    return CURSOR_MCP_UNKNOWN_DESCRIPTION
  }

  if (typeof record.url === 'string' && record.url.trim().length > 0) {
    return record.url
  }

  const command = typeof record.command === 'string' ? record.command : null
  const args = Array.isArray(record.args)
    ? record.args.filter((arg): arg is string => typeof arg === 'string')
    : []
  const description = [command, ...args].filter(Boolean).join(' ')

  return description || CURSOR_MCP_UNKNOWN_DESCRIPTION
}

export function inferCursorScope(
  name: string,
  scopes: CursorMcpConfigScopes,
): { scope: McpServerScope; scopeLabel: string } {
  if (scopes.projectServerNames.has(name)) {
    return { scope: 'project', scopeLabel: CURSOR_MCP_PROJECT_SCOPE_LABEL }
  }

  if (scopes.globalServerNames.has(name)) {
    return { scope: 'global', scopeLabel: CURSOR_MCP_GLOBAL_SCOPE_LABEL }
  }

  return { scope: 'global', scopeLabel: CURSOR_MCP_GLOBAL_SCOPE_LABEL }
}

export function getCursorRecord(
  name: string,
  scopes: CursorMcpConfigScopes,
): CursorMcpServerRecord | null {
  return scopes.projectRecords[name] ?? scopes.globalRecords[name] ?? null
}

export function buildCursorSummary(
  entry: CursorListEntry,
  scopes: CursorMcpConfigScopes,
): McpServerSummary {
  const record = getCursorRecord(entry.name, scopes)
  const { scope, scopeLabel } = inferCursorScope(entry.name, scopes)
  const { status, statusLabel } = mapCursorStatus(entry.statusText)

  return {
    name: entry.name,
    providerId: CURSOR_MCP_PROVIDER_ID,
    providerName: CURSOR_MCP_PROVIDER_NAME,
    scope,
    scopeLabel,
    status,
    statusLabel,
    transportType: normalizeCursorTransportType(record),
    description: getCursorDescription(record),
    enabled: null,
  }
}

export function buildCursorConfigOnlySummary(
  name: string,
  record: CursorMcpServerRecord,
  scope: McpServerScope,
  scopeLabel: string,
): McpServerSummary {
  return {
    name,
    providerId: CURSOR_MCP_PROVIDER_ID,
    providerName: CURSOR_MCP_PROVIDER_NAME,
    scope,
    scopeLabel,
    status: 'unknown',
    statusLabel: 'Configured',
    transportType: normalizeCursorTransportType(record),
    description: getCursorDescription(record),
    enabled: null,
  }
}

export function mergeCursorSummaries(
  listEntries: CursorListEntry[],
  scopes: CursorMcpConfigScopes,
): McpServerSummary[] {
  const listedNames = new Set<string>()
  const summaries = listEntries.map((entry) => {
    listedNames.add(entry.name)
    return buildCursorSummary(entry, scopes)
  })

  for (const [name, record] of Object.entries(scopes.projectRecords)) {
    if (listedNames.has(name)) {
      continue
    }
    summaries.push(
      buildCursorConfigOnlySummary(
        name,
        record,
        'project',
        CURSOR_MCP_PROJECT_SCOPE_LABEL,
      ),
    )
    listedNames.add(name)
  }

  for (const [name, record] of Object.entries(scopes.globalRecords)) {
    if (listedNames.has(name)) {
      continue
    }
    summaries.push(
      buildCursorConfigOnlySummary(
        name,
        record,
        'global',
        CURSOR_MCP_GLOBAL_SCOPE_LABEL,
      ),
    )
  }

  return summaries
}
