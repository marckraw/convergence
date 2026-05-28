import { homedir } from 'os'
import {
  CODEX_MCP_GLOBAL_SCOPE_LABEL,
  CODEX_MCP_INSPECTION_ERROR,
  CODEX_MCP_PROJECT_SCOPE_LABEL,
  CODEX_MCP_PROVIDER_ID,
  CODEX_MCP_PROVIDER_NAME,
} from './codex-mcp.constants'
import {
  getIdentity,
  parseCodexServers,
  toSummary,
  type CodexServerRecord,
} from './codex-mcp.pure'
import { execFileRunner, type CommandRunner } from './command-runner'
import type { McpServerSummary, ProviderMcpVisibility } from './mcp.types'

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
        .map((record) =>
          toSummary(record, 'global', CODEX_MCP_GLOBAL_SCOPE_LABEL),
        )
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
        .map((record) =>
          toSummary(record, 'project', CODEX_MCP_PROJECT_SCOPE_LABEL),
        )
        .filter((server): server is McpServerSummary => server !== null)

      return {
        providerId: CODEX_MCP_PROVIDER_ID,
        providerName: CODEX_MCP_PROVIDER_NAME,
        globalServers,
        projectServers,
        error: null,
      }
    } catch (error) {
      return {
        providerId: CODEX_MCP_PROVIDER_ID,
        providerName: CODEX_MCP_PROVIDER_NAME,
        globalServers: [],
        projectServers: [],
        error:
          error instanceof Error ? error.message : CODEX_MCP_INSPECTION_ERROR,
      }
    }
  }
}
