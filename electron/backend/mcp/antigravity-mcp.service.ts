import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { resolve } from 'path'
import {
  ANTIGRAVITY_MCP_INSPECTION_ERROR,
  ANTIGRAVITY_MCP_NOTE,
  ANTIGRAVITY_MCP_PROVIDER_ID,
  ANTIGRAVITY_MCP_PROVIDER_NAME,
} from './antigravity-mcp.constants'
import {
  buildAntigravityGlobalConfigSources,
  collectAncestorAntigravityMcpConfigSources,
  groupAntigravitySummaries,
  mergeAntigravityConfiguredServers,
} from './antigravity-mcp.pure'
import { parseJsonConfigObject } from './mcp-config.pure'
import type { ProviderMcpVisibility } from './mcp.types'

interface AntigravityMcpServiceOptions {
  homeDir?: string
}

export class AntigravityMcpService {
  private readonly homeDir: string

  constructor(options: AntigravityMcpServiceOptions = {}) {
    this.homeDir = resolve(options.homeDir ?? homedir())
  }

  private async readConfig(
    path: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      return parseJsonConfigObject(await readFile(path, 'utf-8'))
    } catch {
      return null
    }
  }

  private async listConfiguredServers(
    projectPath: string | null,
  ): Promise<ReturnType<typeof mergeAntigravityConfiguredServers>> {
    const sources = [
      ...buildAntigravityGlobalConfigSources(this.homeDir),
      ...(projectPath
        ? collectAncestorAntigravityMcpConfigSources(projectPath)
        : []),
    ]

    const entries = await Promise.all(
      sources.map(async (source) => ({
        source,
        config: await this.readConfig(source.path),
      })),
    )

    return mergeAntigravityConfiguredServers(entries)
  }

  async list(projectPath?: string): Promise<ProviderMcpVisibility> {
    try {
      const servers = await this.listConfiguredServers(projectPath ?? null)
      const { globalServers, projectServers } =
        groupAntigravitySummaries(servers)

      return {
        providerId: ANTIGRAVITY_MCP_PROVIDER_ID,
        providerName: ANTIGRAVITY_MCP_PROVIDER_NAME,
        globalServers,
        projectServers,
        error: null,
        note: ANTIGRAVITY_MCP_NOTE,
      }
    } catch (error) {
      return {
        providerId: ANTIGRAVITY_MCP_PROVIDER_ID,
        providerName: ANTIGRAVITY_MCP_PROVIDER_NAME,
        globalServers: [],
        projectServers: [],
        error:
          error instanceof Error
            ? error.message
            : ANTIGRAVITY_MCP_INSPECTION_ERROR,
        note: ANTIGRAVITY_MCP_NOTE,
      }
    }
  }
}
