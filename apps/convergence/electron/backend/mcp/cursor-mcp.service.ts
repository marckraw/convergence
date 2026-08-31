import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  CURSOR_MCP_INSPECTION_ERROR,
  CURSOR_MCP_PROVIDER_ID,
  CURSOR_MCP_PROVIDER_NAME,
} from './cursor-mcp.constants'
import {
  buildCursorConfigScopes,
  mergeCursorSummaries,
  parseCursorListEntries,
} from './cursor-mcp.pure'
import {
  parseJsonConfigObject,
  partitionMcpSummariesByScope,
} from './mcp-config.pure'
import { execFileRunner, type CommandRunner } from './command-runner'
import type { ProviderMcpVisibility } from './mcp.types'

interface CursorMcpServiceOptions {
  homeDir?: string
}

async function readJsonObject(
  path: string,
): Promise<Record<string, unknown> | null> {
  try {
    return parseJsonConfigObject(await fs.readFile(path, 'utf8'))
  } catch {
    return null
  }
}

export class CursorMcpService {
  private readonly homeDir: string

  constructor(
    private binaryPath: string,
    private runner: CommandRunner = execFileRunner,
    options: CursorMcpServiceOptions = {},
  ) {
    this.homeDir = options.homeDir ?? homedir()
  }

  async list(projectPath: string): Promise<ProviderMcpVisibility> {
    try {
      const [listResult, scopes] = await Promise.all([
        this.runner(this.binaryPath, ['mcp', 'list'], { cwd: projectPath }),
        buildCursorConfigScopes(
          await readJsonObject(join(this.homeDir, '.cursor', 'mcp.json')),
          await readJsonObject(join(projectPath, '.cursor', 'mcp.json')),
        ),
      ])

      const summaries = mergeCursorSummaries(
        parseCursorListEntries(listResult.stdout),
        scopes,
      )
      const { globalServers, projectServers } =
        partitionMcpSummariesByScope(summaries)

      return {
        providerId: CURSOR_MCP_PROVIDER_ID,
        providerName: CURSOR_MCP_PROVIDER_NAME,
        globalServers,
        projectServers,
        error: null,
      }
    } catch (error) {
      return {
        providerId: CURSOR_MCP_PROVIDER_ID,
        providerName: CURSOR_MCP_PROVIDER_NAME,
        globalServers: [],
        projectServers: [],
        error:
          error instanceof Error ? error.message : CURSOR_MCP_INSPECTION_ERROR,
      }
    }
  }
}
