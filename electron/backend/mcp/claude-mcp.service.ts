import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { execFileRunner, type CommandRunner } from './command-runner'
import type {
  McpServerScope,
  McpServerStatus,
  McpServerSummary,
  McpTransportType,
  ProviderMcpVisibility,
} from './mcp.types'

interface ClaudeListEntry {
  name: string
  description: string
  statusLabel: string
  transportType: McpTransportType
}

interface ClaudeConfigScopes {
  globalServerNames: Set<string>
  projectServerNames: Set<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractServerNames(value: unknown): string[] {
  if (!isRecord(value)) {
    return []
  }

  return Object.keys(value)
}

async function readJsonObject(
  path: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function loadClaudeConfigScopes(
  projectPath: string,
): Promise<ClaudeConfigScopes> {
  const globalServerNames = new Set<string>()
  const projectServerNames = new Set<string>()

  const userConfig = await readJsonObject(join(homedir(), '.claude.json'))
  if (userConfig) {
    for (const name of extractServerNames(userConfig.mcpServers)) {
      globalServerNames.add(name)
    }

    const projects = isRecord(userConfig.projects) ? userConfig.projects : null
    const projectConfig = projects?.[projectPath]
    for (const name of extractServerNames(
      isRecord(projectConfig) ? projectConfig.mcpServers : null,
    )) {
      projectServerNames.add(name)
    }
  }

  const projectMcpJson = await readJsonObject(join(projectPath, '.mcp.json'))
  if (projectMcpJson) {
    for (const name of [
      ...extractServerNames(projectMcpJson.mcpServers),
      ...extractServerNames(projectMcpJson.servers),
    ]) {
      projectServerNames.add(name)
    }
  }

  return { globalServerNames, projectServerNames }
}

function normalizeClaudeListDescription(rawDescription: string): {
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

function parseClaudeListEntries(stdout: string): ClaudeListEntry[] {
  return stdout.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(.+?):\s+(.+?)\s+-\s+([!✓✗].+)$/)
    if (!match) {
      return []
    }

    const name = match[1]?.trim()
    const rawDescription = match[2]?.trim()
    const statusLabel = match[3]?.trim()
    if (!name || !rawDescription || !statusLabel) {
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

function inferClaudeScope(
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

function buildClaudeFallbackSummary(
  entry: ClaudeListEntry,
  scopes: ClaudeConfigScopes,
): McpServerSummary {
  const { scope, scopeLabel } = inferClaudeScope(entry.name, scopes)

  return {
    name: entry.name,
    providerId: 'claude-code',
    providerName: 'Claude Code',
    scope,
    scopeLabel,
    status: mapClaudeStatus(entry.statusLabel),
    statusLabel: entry.statusLabel,
    transportType: entry.transportType,
    description: entry.description,
    enabled: null,
  }
}

function mapClaudeScope(scopeLabel: string): McpServerScope {
  return scopeLabel.startsWith('User config') ? 'global' : 'project'
}

function mapClaudeStatus(statusLabel: string): McpServerStatus {
  if (statusLabel.includes('Needs authentication')) {
    return 'needs-auth'
  }

  if (statusLabel.includes('Failed')) {
    return 'failed'
  }

  if (statusLabel.includes('Disabled')) {
    return 'disabled'
  }

  if (statusLabel.startsWith('✓')) {
    return 'ready'
  }

  return 'unknown'
}

function mapClaudeTransport(typeLabel: string): McpTransportType {
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

function parseClaudeServerDetails(
  providerId: string,
  providerName: string,
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
    providerId,
    providerName,
    scope: mapClaudeScope(scopeLabel),
    scopeLabel,
    status: mapClaudeStatus(statusLabel),
    statusLabel,
    transportType: mapClaudeTransport(transportLabel),
    description: description || 'Unknown',
    enabled: null,
  }
}

export class ClaudeMcpService {
  constructor(
    private binaryPath: string,
    private runner: CommandRunner = execFileRunner,
  ) {}

  async list(projectPath: string): Promise<ProviderMcpVisibility> {
    try {
      const [{ stdout }, scopes] = await Promise.all([
        this.runner(this.binaryPath, ['mcp', 'list'], {
          cwd: projectPath,
        }),
        loadClaudeConfigScopes(projectPath),
      ])

      const listEntries = parseClaudeListEntries(stdout)
      const serverDetails = await Promise.all(
        listEntries.map(async (entry) => {
          try {
            const result = await this.runner(
              this.binaryPath,
              ['mcp', 'get', entry.name],
              { cwd: projectPath },
            )

            return (
              parseClaudeServerDetails(
                'claude-code',
                'Claude Code',
                result.stdout,
              ) ?? buildClaudeFallbackSummary(entry, scopes)
            )
          } catch {
            return buildClaudeFallbackSummary(entry, scopes)
          }
        }),
      )

      return {
        providerId: 'claude-code',
        providerName: 'Claude Code',
        globalServers: serverDetails.filter(
          (server) => server.scope === 'global',
        ),
        projectServers: serverDetails.filter(
          (server) => server.scope === 'project',
        ),
        error: null,
      }
    } catch (error) {
      return {
        providerId: 'claude-code',
        providerName: 'Claude Code',
        globalServers: [],
        projectServers: [],
        error:
          error instanceof Error
            ? error.message
            : 'Failed to inspect Claude MCP servers',
      }
    }
  }
}
