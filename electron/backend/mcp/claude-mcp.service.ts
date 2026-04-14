import { execFileRunner, type CommandRunner } from './command-runner'
import type {
  McpServerScope,
  McpServerStatus,
  McpServerSummary,
  McpTransportType,
  ProviderMcpVisibility,
} from './mcp.types'

function parseClaudeServerNames(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.match(/^([^:\s][^:]*)\s*:/)?.[1]?.trim() ?? null)
    .filter((name): name is string => !!name)
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
      const { stdout } = await this.runner(this.binaryPath, ['mcp', 'list'], {
        cwd: projectPath,
      })

      const serverNames = parseClaudeServerNames(stdout)
      const serverDetails = await Promise.all(
        serverNames.map(async (name) => {
          const result = await this.runner(
            this.binaryPath,
            ['mcp', 'get', name],
            { cwd: projectPath },
          )

          return parseClaudeServerDetails(
            'claude-code',
            'Claude Code',
            result.stdout,
          )
        }),
      )

      const servers = serverDetails.filter(
        (server): server is McpServerSummary => server !== null,
      )

      return {
        providerId: 'claude-code',
        providerName: 'Claude Code',
        globalServers: servers.filter((server) => server.scope === 'global'),
        projectServers: servers.filter((server) => server.scope === 'project'),
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
