import {
  CLAUDE_MCP_PROVIDER_ID,
  CLAUDE_MCP_PROVIDER_NAME,
} from './claude-mcp.constants'
import type {
  McpServerScope,
  McpServerStatus,
  McpServerSummary,
  McpTransportType,
} from './mcp.types'

export interface ClaudeListEntry {
  name: string
  description: string
  statusLabel: string
  transportType: McpTransportType
}

export interface ClaudeConfigScopes {
  globalServerNames: Set<string>
  projectServerNames: Set<string>
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function extractServerNames(value: unknown): string[] {
  if (!isRecord(value)) {
    return []
  }

  return Object.keys(value)
}

export function normalizeClaudeListDescription(rawDescription: string): {
  description: string
  transportType: McpTransportType
} {
  const suffixMatch = rawDescription.match(/\s+\((HTTP|SSE)\)$/i)
  if (suffixMatch) {
    const description = rawDescription
      .slice(0, suffixMatch.index ?? rawDescription.length)
      .trim()
    return {
      description,
      transportType: suffixMatch[1]?.toLowerCase() === 'sse' ? 'sse' : 'http',
    }
  }

  if (/^https?:\/\//i.test(rawDescription)) {
    return {
      description: rawDescription,
      transportType: /\/sse(?:$|[/?#])/i.test(rawDescription) ? 'sse' : 'http',
    }
  }

  return {
    description: rawDescription,
    transportType: rawDescription.trim().length > 0 ? 'stdio' : 'unknown',
  }
}

/**
 * Optional check/cross/`!` decoration before a Claude `mcp list` status.
 * Glyphs are decoration only — the status is recognised by its words (MAR-3205).
 */
const CLAUDE_LIST_STATUS_MARK = /^[✓✔✗✘!]\s*/

/**
 * Known status words after an optional mark. Prefer a ` - ` whose right-hand
 * side matches these so a description that itself contains ` - ` stays intact.
 */
const CLAUDE_LIST_KNOWN_STATUS =
  /^(?:Connected|Needs authentication|Failed\b.*|Disabled|Pending\b.*)$/i

function isClaudeListKnownStatus(statusLabel: string): boolean {
  return CLAUDE_LIST_KNOWN_STATUS.test(
    statusLabel.replace(CLAUDE_LIST_STATUS_MARK, '').trim(),
  )
}

/**
 * Index of the ` - ` that introduces the status: the rightmost separator whose
 * tail is a known status word, else the rightmost separator at all (R3 keeps
 * an invented status rather than dropping the line).
 */
function findClaudeListStatusSeparator(afterName: string): number {
  const separator = ' - '
  let rightmost = -1
  let searchFrom = afterName.length
  while (searchFrom > 0) {
    const index = afterName.lastIndexOf(separator, searchFrom - 1)
    if (index < 0) {
      break
    }
    if (rightmost < 0) {
      rightmost = index
    }
    const candidate = afterName.slice(index + separator.length).trim()
    if (isClaudeListKnownStatus(candidate)) {
      return index
    }
    searchFrom = index
  }
  return rightmost
}

/**
 * Pattern: Parser — Claude `mcp list` rows are `<name>: <description> - <status>`.
 * Status is recognised by its words; any check/cross/`!` (or none) is decoration.
 * Split on the last status ` - `; names may contain colons; an unreadable
 * status is kept as unknown, never dropped (MAR-3205).
 */
export function parseClaudeListEntries(stdout: string): ClaudeListEntry[] {
  return stdout.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      return []
    }
    if (trimmed.startsWith('Checking MCP server health')) {
      return []
    }

    const colonIndex = trimmed.indexOf(': ')
    if (colonIndex < 0) {
      return []
    }

    const name = trimmed.slice(0, colonIndex).trim()
    const afterName = trimmed.slice(colonIndex + 2)
    if (!name || afterName.trim().length === 0) {
      return []
    }

    const separator = ' - '
    const splitAt = findClaudeListStatusSeparator(afterName)

    let rawDescription: string
    let statusLabel: string
    if (splitAt >= 0) {
      rawDescription = afterName.slice(0, splitAt).trim()
      statusLabel = afterName.slice(splitAt + separator.length).trim()
    } else {
      // `: ` present but no ` - ` status separator — keep as unknown (R3).
      rawDescription = afterName.trim()
      statusLabel = afterName.trim()
    }

    if (!rawDescription || !statusLabel) {
      return []
    }

    const { description, transportType } =
      normalizeClaudeListDescription(rawDescription)

    return [
      {
        name,
        description,
        statusLabel,
        transportType,
      },
    ]
  })
}

export function inferClaudeScope(
  name: string,
  scopes: ClaudeConfigScopes,
): { scope: McpServerScope; scopeLabel: string } {
  if (scopes.projectServerNames.has(name)) {
    return { scope: 'project', scopeLabel: 'Project config' }
  }

  if (scopes.globalServerNames.has(name)) {
    return { scope: 'global', scopeLabel: 'User config' }
  }

  return { scope: 'global', scopeLabel: 'Built-in global' }
}

export function buildClaudeFallbackSummary(
  entry: ClaudeListEntry,
  scopes: ClaudeConfigScopes,
): McpServerSummary {
  const { scope, scopeLabel } = inferClaudeScope(entry.name, scopes)

  return {
    name: entry.name,
    providerId: CLAUDE_MCP_PROVIDER_ID,
    providerName: CLAUDE_MCP_PROVIDER_NAME,
    scope,
    scopeLabel,
    status: mapClaudeStatus(entry.statusLabel),
    statusLabel: entry.statusLabel,
    transportType: entry.transportType,
    description: entry.description,
    enabled: null,
  }
}

export function mapClaudeScope(scopeLabel: string): McpServerScope {
  return scopeLabel.startsWith('User config') ? 'global' : 'project'
}

export function mapClaudeStatus(statusLabel: string): McpServerStatus {
  if (statusLabel.includes('Needs authentication')) {
    return 'needs-auth'
  }

  if (statusLabel.includes('Failed')) {
    return 'failed'
  }

  if (statusLabel.includes('Disabled')) {
    return 'disabled'
  }

  // By the word — any or no check glyph (MAR-3205 R1). Older CLIs print ✓;
  // Claude Code 2.1.x prints ✔; both mean ready.
  if (statusLabel.includes('Connected')) {
    return 'ready'
  }

  return 'unknown'
}

export function mapClaudeTransport(typeLabel: string): McpTransportType {
  switch (typeLabel.trim().toLowerCase()) {
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

export function parseClaudeServerDetails(
  stdout: string,
): McpServerSummary | null {
  const lines = stdout.split(/\r?\n/)
  const name = lines[0]?.match(/^(.+):$/)?.[1]?.trim()
  if (!name) {
    return null
  }

  const details = new Map<string, string>()
  for (const line of lines.slice(1)) {
    const match = line.match(/^\s{2}([^:]+):\s*(.*)$/)
    if (!match) continue
    details.set(match[1].trim(), match[2].trim())
  }

  const scopeLabel = details.get('Scope') ?? 'Project config'
  const statusLabel = details.get('Status') ?? 'Unknown'
  const transportLabel = details.get('Type') ?? 'unknown'
  const url = details.get('URL')
  const command = details.get('Command')
  const args = details.get('Args')
  const fallbackDescription = [command, args].filter(Boolean).join(' ')
  const description = url ?? fallbackDescription

  return {
    name,
    providerId: CLAUDE_MCP_PROVIDER_ID,
    providerName: CLAUDE_MCP_PROVIDER_NAME,
    scope: mapClaudeScope(scopeLabel),
    scopeLabel,
    status: mapClaudeStatus(statusLabel),
    statusLabel,
    transportType: mapClaudeTransport(transportLabel),
    description: description || 'Unknown',
    enabled: null,
  }
}
