import { homedir } from 'os'
import { execFileRunner, type CommandRunner } from './command-runner'
import type {
  McpServerScope,
  McpServerStatus,
  McpServerSummary,
  McpTransportType,
  ProviderMcpVisibility,
} from './mcp.types'

interface CodexTransportRecord {
  type?: unknown
  url?: unknown
  command?: unknown
  args?: unknown
}

interface CodexServerRecord {
  name?: unknown
  enabled?: unknown
  disabled_reason?: unknown
  transport?: CodexTransportRecord
  startup_timeout_sec?: unknown
  tool_timeout_sec?: unknown
  enabled_tools?: unknown
  disabled_tools?: unknown
}

function parseCodexServers(stdout: string): CodexServerRecord[] {
  const parsed = JSON.parse(stdout) as unknown
  return Array.isArray(parsed) ? (parsed as CodexServerRecord[]) : []
}

function normalizeTransportType(type: unknown): McpTransportType {
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

function normalizeCodexStatus(
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

function toSummary(
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
    providerId: 'codex',
    providerName: 'Codex',
    scope,
    scopeLabel,
    status: status.status,
    statusLabel: status.statusLabel,
    transportType: normalizeTransportType(transport.type),
    description: description || 'Unknown',
    enabled,
  }
}

function getIdentity(record: CodexServerRecord): string {
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

export class CodexMcpService {
  constructor(
    private binaryPath: string,
    private runner: CommandRunner = execFileRunner,
  ) {}

  private async listGlobal(): Promise<CodexServerRecord[]> {
    const { stdout } = await this.runner(
      this.binaryPath,
      ['mcp', 'list', '--json'],
      { cwd: homedir() },
    )
    return parseCodexServers(stdout)
  }

  private async listEffectiveProject(
    projectPath: string,
  ): Promise<CodexServerRecord[]> {
    const { stdout } = await this.runner(
      this.binaryPath,
      ['-C', projectPath, 'mcp', 'list', '--json'],
      { cwd: homedir() },
    )
    return parseCodexServers(stdout)
  }

  async list(projectPath: string): Promise<ProviderMcpVisibility> {
    try {
      const [globalRecords, effectiveProjectRecords] = await Promise.all([
        this.listGlobal(),
        this.listEffectiveProject(projectPath),
      ])

      const globalByName = new Map(
        globalRecords
          .map((record) => {
            const name = typeof record.name === 'string' ? record.name : null
            return name ? ([name, record] as const) : null
          })
          .filter(
            (entry): entry is readonly [string, CodexServerRecord] => !!entry,
          ),
      )

      const globalServers = globalRecords
        .map((record) => toSummary(record, 'global', 'Global config'))
        .filter((server): server is McpServerSummary => server !== null)

      const projectServers = effectiveProjectRecords
        .filter((record) => {
          const name = typeof record.name === 'string' ? record.name : null
          if (!name) {
            return false
          }

          const globalRecord = globalByName.get(name)
          if (!globalRecord) {
            return true
          }

          return getIdentity(globalRecord) !== getIdentity(record)
        })
        .map((record) => toSummary(record, 'project', 'Project config'))
        .filter((server): server is McpServerSummary => server !== null)

      return {
        providerId: 'codex',
        providerName: 'Codex',
        globalServers,
        projectServers,
        error: null,
      }
    } catch (error) {
      return {
        providerId: 'codex',
        providerName: 'Codex',
        globalServers: [],
        projectServers: [],
        error:
          error instanceof Error
            ? error.message
            : 'Failed to inspect Codex MCP servers',
      }
    }
  }
}
