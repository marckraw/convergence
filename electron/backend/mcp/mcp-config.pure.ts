import type { McpServerScope, McpServerSummary } from './mcp.types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseJsonConfigObject(
  raw: string,
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function extractMcpServerRecords<T extends object>(
  value: unknown,
): Record<string, T> {
  if (!isRecord(value)) {
    return {}
  }

  const rawServers = value.mcpServers ?? value['mcp-servers']
  if (!isRecord(rawServers)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(rawServers).filter((entry): entry is [string, T] =>
      isRecord(entry[1]),
    ),
  ) as Record<string, T>
}

export function partitionMcpSummariesByScope(summaries: McpServerSummary[]): {
  globalServers: McpServerSummary[]
  projectServers: McpServerSummary[]
} {
  return {
    globalServers: summaries.filter((server) => server.scope === 'global'),
    projectServers: summaries.filter((server) => server.scope === 'project'),
  }
}

export function buildMcpConfigScopeSets<T extends object>(
  globalRecords: Record<string, T>,
  projectRecords: Record<string, T>,
): {
  globalServerNames: Set<string>
  projectServerNames: Set<string>
} {
  return {
    globalServerNames: new Set(Object.keys(globalRecords)),
    projectServerNames: new Set(Object.keys(projectRecords)),
  }
}

export interface McpConfigPathSource {
  path: string
  scope: McpServerScope
  scopeLabel: string
}
