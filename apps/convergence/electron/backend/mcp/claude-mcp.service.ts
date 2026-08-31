import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  CLAUDE_MCP_PROVIDER_ID,
  CLAUDE_MCP_PROVIDER_NAME,
} from './claude-mcp.constants'
import {
  buildClaudeFallbackSummary,
  extractServerNames,
  isRecord,
  parseClaudeListEntries,
  parseClaudeServerDetails,
  type ClaudeConfigScopes,
} from './claude-mcp.pure'
import { execFileRunner, type CommandRunner } from './command-runner'
import type { ProviderMcpVisibility } from './mcp.types'

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
              parseClaudeServerDetails(result.stdout) ??
              buildClaudeFallbackSummary(entry, scopes)
            )
          } catch {
            return buildClaudeFallbackSummary(entry, scopes)
          }
        }),
      )

      return {
        providerId: CLAUDE_MCP_PROVIDER_ID,
        providerName: CLAUDE_MCP_PROVIDER_NAME,
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
        providerId: CLAUDE_MCP_PROVIDER_ID,
        providerName: CLAUDE_MCP_PROVIDER_NAME,
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
