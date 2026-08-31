import { access, readFile } from 'fs/promises'
import { homedir } from 'os'
import { join, resolve } from 'path'
import type {
  McpServerScope,
  McpServerStatus,
  McpServerSummary,
  McpTransportType,
  ProviderMcpVisibility,
} from './mcp.types'

interface PiMcpServiceOptions {
  homeDir?: string
  agentDir?: string
  env?: NodeJS.ProcessEnv
}

interface PiMcpConfig {
  mcpServers: Record<string, PiMcpServerRecord>
  imports?: string[]
}

interface PiMcpServerRecord {
  command?: unknown
  args?: unknown
  url?: unknown
  auth?: unknown
  bearerToken?: unknown
  bearerTokenEnv?: unknown
  lifecycle?: unknown
  disabled?: unknown
  enabled?: unknown
}

interface PiMcpConfigSource {
  path: string
  scope: McpServerScope
  scopeLabel: string
}

interface PiMcpServerWithSource {
  name: string
  record: PiMcpServerRecord
  source: PiMcpConfigSource
}

const PI_MCP_NOTE =
  'Pi MCP support comes from the pi-mcp-adapter extension. Convergence reads the adapter config files and OAuth token markers, but live connection state is only available inside Pi through /mcp.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function normalizeConfig(raw: unknown): PiMcpConfig {
  if (!isRecord(raw)) {
    return { mcpServers: {} }
  }

  const rawServers = raw.mcpServers ?? raw['mcp-servers']
  const mcpServers = isRecord(rawServers)
    ? Object.fromEntries(
        Object.entries(rawServers).filter(
          (entry): entry is [string, PiMcpServerRecord] => isRecord(entry[1]),
        ),
      )
    : {}

  return {
    mcpServers,
    imports: Array.isArray(raw.imports)
      ? raw.imports.filter((item): item is string => typeof item === 'string')
      : undefined,
  }
}

function extractImportedServers(
  raw: unknown,
): Record<string, PiMcpServerRecord> {
  return normalizeConfig(raw).mcpServers
}

function getImportCandidates(
  kind: string,
  homeDir: string,
  projectPath: string | null,
): string[] {
  switch (kind) {
    case 'cursor':
      return [join(homeDir, '.cursor', 'mcp.json')]
    case 'claude-code':
      return [
        join(homeDir, '.claude', 'mcp.json'),
        join(homeDir, '.claude.json'),
        join(homeDir, '.claude', 'claude_desktop_config.json'),
      ]
    case 'claude-desktop':
      return [
        join(
          homeDir,
          'Library',
          'Application Support',
          'Claude',
          'claude_desktop_config.json',
        ),
      ]
    case 'codex':
      return [join(homeDir, '.codex', 'config.json')]
    case 'windsurf':
      return [join(homeDir, '.windsurf', 'mcp.json')]
    case 'vscode':
      return projectPath ? [join(projectPath, '.vscode', 'mcp.json')] : []
    default:
      return []
  }
}

function normalizeTransportType(record: PiMcpServerRecord): McpTransportType {
  if (typeof record.command === 'string') {
    return 'stdio'
  }

  if (typeof record.url === 'string') {
    return 'streamable_http'
  }

  return 'unknown'
}

function getDescription(record: PiMcpServerRecord): string {
  if (typeof record.url === 'string' && record.url.trim().length > 0) {
    return record.url
  }

  const command = typeof record.command === 'string' ? record.command : null
  const args = Array.isArray(record.args)
    ? record.args.filter((arg): arg is string => typeof arg === 'string')
    : []
  const description = [command, ...args].filter(Boolean).join(' ')

  return description || 'Configured in Pi MCP adapter'
}

function isDisabled(record: PiMcpServerRecord): boolean {
  return record.enabled === false || record.disabled === true
}

function getLifecycleLabel(record: PiMcpServerRecord): string {
  return typeof record.lifecycle === 'string' && record.lifecycle.length > 0
    ? record.lifecycle
    : 'lazy'
}

export class PiMcpService {
  private readonly homeDir: string
  private readonly agentDir: string
  private readonly env: NodeJS.ProcessEnv

  constructor(options: PiMcpServiceOptions = {}) {
    this.homeDir = options.homeDir ?? homedir()
    this.env = options.env ?? process.env
    this.agentDir =
      options.agentDir ??
      this.env.PI_CODING_AGENT_DIR ??
      join(this.homeDir, '.pi', 'agent')
  }

  private getConfigSources(projectPath: string | null): PiMcpConfigSource[] {
    const sources: PiMcpConfigSource[] = [
      {
        path: join(this.homeDir, '.config', 'mcp', 'mcp.json'),
        scope: 'global',
        scopeLabel: 'Shared global config',
      },
      {
        path: join(this.agentDir, 'mcp.json'),
        scope: 'global',
        scopeLabel: 'Pi global override',
      },
    ]

    if (projectPath) {
      sources.push(
        {
          path: join(projectPath, '.mcp.json'),
          scope: 'project',
          scopeLabel: 'Shared project config',
        },
        {
          path: join(projectPath, '.pi', 'mcp.json'),
          scope: 'project',
          scopeLabel: 'Pi project override',
        },
      )
    }

    return sources
  }

  private async readConfig(path: string): Promise<PiMcpConfig | null> {
    try {
      return normalizeConfig(JSON.parse(await readFile(path, 'utf-8')))
    } catch {
      return null
    }
  }

  private async readImportedServers(
    importKind: string,
    projectPath: string | null,
  ): Promise<Record<string, PiMcpServerRecord>> {
    for (const candidate of getImportCandidates(
      importKind,
      this.homeDir,
      projectPath,
    )) {
      try {
        return extractImportedServers(
          JSON.parse(await readFile(resolve(candidate), 'utf-8')),
        )
      } catch {
        continue
      }
    }

    return {}
  }

  private async listConfiguredServers(
    projectPath: string | null,
  ): Promise<PiMcpServerWithSource[]> {
    const byName = new Map<string, PiMcpServerWithSource>()

    for (const source of this.getConfigSources(projectPath)) {
      const config = await this.readConfig(source.path)
      if (!config) {
        continue
      }

      for (const importKind of config.imports ?? []) {
        const importedServers = await this.readImportedServers(
          importKind,
          projectPath,
        )

        for (const [name, record] of Object.entries(importedServers)) {
          if (!byName.has(name)) {
            byName.set(name, {
              name,
              record,
              source: {
                ...source,
                scopeLabel: `${source.scopeLabel} import`,
              },
            })
          }
        }
      }

      for (const [name, record] of Object.entries(config.mcpServers)) {
        byName.set(name, { name, record, source })
      }
    }

    return Array.from(byName.values())
  }

  private async hasOAuthTokens(serverName: string): Promise<boolean> {
    return exists(join(this.agentDir, 'mcp-oauth', serverName, 'tokens.json'))
  }

  private getBearerTokenConfigured(record: PiMcpServerRecord): boolean {
    if (
      typeof record.bearerToken === 'string' &&
      record.bearerToken.length > 0
    ) {
      return true
    }

    if (
      typeof record.bearerTokenEnv === 'string' &&
      record.bearerTokenEnv.length > 0
    ) {
      return Boolean(this.env[record.bearerTokenEnv])
    }

    return false
  }

  private async toSummary({
    name,
    record,
    source,
  }: PiMcpServerWithSource): Promise<McpServerSummary> {
    let status: McpServerStatus = 'ready'
    let statusLabel: string

    if (isDisabled(record)) {
      status = 'disabled'
      statusLabel = 'Disabled'
    } else if (record.auth === 'oauth') {
      const hasTokens = await this.hasOAuthTokens(name)
      status = hasTokens ? 'ready' : 'needs-auth'
      statusLabel = hasTokens ? 'Authorized' : 'Needs authentication'
    } else if (
      record.auth === 'bearer' &&
      !this.getBearerTokenConfigured(record)
    ) {
      status = 'needs-auth'
      statusLabel = 'Missing bearer token'
    } else {
      const lifecycle = getLifecycleLabel(record)
      statusLabel = lifecycle === 'lazy' ? 'Configured' : lifecycle
    }

    return {
      name,
      providerId: 'pi',
      providerName: 'Pi Agent',
      scope: source.scope,
      scopeLabel: source.scopeLabel,
      status,
      statusLabel,
      transportType: normalizeTransportType(record),
      description: getDescription(record),
      enabled: !isDisabled(record),
    }
  }

  async list(projectPath?: string): Promise<ProviderMcpVisibility> {
    const configuredServers = await this.listConfiguredServers(
      projectPath ?? null,
    )
    const summaries = await Promise.all(
      configuredServers.map((server) => this.toSummary(server)),
    )

    return {
      providerId: 'pi',
      providerName: 'Pi Agent',
      globalServers: summaries.filter((server) => server.scope === 'global'),
      projectServers: summaries.filter((server) => server.scope === 'project'),
      error: null,
      note: PI_MCP_NOTE,
    }
  }
}
