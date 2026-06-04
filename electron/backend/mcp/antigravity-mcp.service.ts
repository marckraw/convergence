import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import {
  ANTIGRAVITY_MCP_GLOBAL_SCOPE_LABEL,
  ANTIGRAVITY_MCP_INSPECTION_ERROR,
  ANTIGRAVITY_MCP_LEGACY_GLOBAL_SCOPE_LABEL,
  ANTIGRAVITY_MCP_NOTE,
  ANTIGRAVITY_MCP_PROJECT_SCOPE_LABEL,
  ANTIGRAVITY_MCP_PROVIDER_ID,
  ANTIGRAVITY_MCP_PROVIDER_NAME,
} from './antigravity-mcp.constants'
import {
  extractMcpServerRecords,
  groupAntigravitySummaries,
  type AntigravityMcpServerWithSource,
} from './antigravity-mcp.pure'
import type { McpServerScope, ProviderMcpVisibility } from './mcp.types'

interface AntigravityMcpServiceOptions {
  homeDir?: string
}

interface AntigravityMcpConfigSource {
  path: string
  scope: McpServerScope
  scopeLabel: string
}

function collectAncestorMcpConfigSources(
  projectPath: string,
): AntigravityMcpConfigSource[] {
  const sources: AntigravityMcpConfigSource[] = []
  let current = resolve(projectPath)

  for (;;) {
    sources.push({
      path: join(current, '.agents', 'mcp_config.json'),
      scope: 'project',
      scopeLabel: ANTIGRAVITY_MCP_PROJECT_SCOPE_LABEL,
    })

    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  return sources.reverse()
}

export class AntigravityMcpService {
  private readonly homeDir: string

  constructor(options: AntigravityMcpServiceOptions = {}) {
    this.homeDir = resolve(options.homeDir ?? homedir())
  }

  private getGlobalConfigSources(): AntigravityMcpConfigSource[] {
    return [
      {
        path: join(this.homeDir, '.gemini', 'settings.json'),
        scope: 'global',
        scopeLabel: ANTIGRAVITY_MCP_LEGACY_GLOBAL_SCOPE_LABEL,
      },
      {
        path: join(this.homeDir, '.gemini', 'config', 'mcp_config.json'),
        scope: 'global',
        scopeLabel: ANTIGRAVITY_MCP_GLOBAL_SCOPE_LABEL,
      },
    ]
  }

  private async readConfig(
    path: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf-8')) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }

  private async listConfiguredServers(
    projectPath: string | null,
  ): Promise<AntigravityMcpServerWithSource[]> {
    const byName = new Map<string, AntigravityMcpServerWithSource>()
    const sources = [
      ...this.getGlobalConfigSources(),
      ...(projectPath ? collectAncestorMcpConfigSources(projectPath) : []),
    ]

    for (const source of sources) {
      const config = await this.readConfig(source.path)
      if (!config) {
        continue
      }

      const records = extractMcpServerRecords(config)
      for (const [name, record] of Object.entries(records)) {
        byName.set(name, {
          name,
          record,
          scope: source.scope,
          scopeLabel: source.scopeLabel,
        })
      }
    }

    return Array.from(byName.values())
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
