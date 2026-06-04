import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  CURSOR_MCP_INSPECTION_ERROR,
  CURSOR_MCP_PROVIDER_ID,
  CURSOR_MCP_PROVIDER_NAME,
} from './cursor-mcp.constants'
import {
  extractMcpServerRecords,
  mergeCursorSummaries,
  parseCursorListEntries,
  type CursorMcpConfigScopes,
} from './cursor-mcp.pure'
import { execFileRunner, type CommandRunner } from './command-runner'
import type { McpServerSummary, ProviderMcpVisibility } from './mcp.types'

interface CursorMcpServiceOptions {
  homeDir?: string
}

async function readJsonObject(
  path: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

async function loadCursorConfigScopes(
  projectPath: string,
  homeDir: string,
): Promise<CursorMcpConfigScopes> {
  const globalRecords = extractMcpServerRecords(
    await readJsonObject(join(homeDir, '.cursor', 'mcp.json')),
  )
  const projectRecords = extractMcpServerRecords(
    await readJsonObject(join(projectPath, '.cursor', 'mcp.json')),
  )

  return {
    globalServerNames: new Set(Object.keys(globalRecords)),
    projectServerNames: new Set(Object.keys(projectRecords)),
    globalRecords,
    projectRecords,
  }
}

function partitionSummaries(summaries: McpServerSummary[]): {
  globalServers: McpServerSummary[]
  projectServers: McpServerSummary[]
} {
  return {
    globalServers: summaries.filter((server) => server.scope === 'global'),
    projectServers: summaries.filter((server) => server.scope === 'project'),
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
        loadCursorConfigScopes(projectPath, this.homeDir),
      ])

      const summaries = mergeCursorSummaries(
        parseCursorListEntries(listResult.stdout),
        scopes,
      )
      const { globalServers, projectServers } = partitionSummaries(summaries)

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
