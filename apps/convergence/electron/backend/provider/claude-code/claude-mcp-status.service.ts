import { promises as fs } from 'fs'
import { join } from 'path'
import type {
  HarnessFact,
  PluginMcpServerFact,
} from '../../../../src/shared/types/harness-facts.types'
import { claudeRecord, claudeString } from './claude-evidence.pure'
import {
  isInsidePath,
  mcpJsonServerBlock,
  pluginJsonMcpServers,
  pluginRootPath,
  readClaudeMcpStatus,
  readPluginMcpServers,
} from './claude-harness.pure'
import type { ClaudeTransport } from './claude-transport.service'

type McpStatusFact = Extract<HarnessFact, { kind: 'harness.mcpStatus' }>

/**
 * Reads the running process's MCP status for the conversation's Details
 * (MAR-3206 R1) and records it as a harness fact.
 *
 * The status comes from the resident query itself, so it is what THIS
 * process loaded, not what a terminal on the same account would. A plugin
 * server the harness dropped for a duplicate address is absent from that
 * status; the plugin's own manifest is the only place its address is left,
 * so the loaded plugins' manifests are read too -- names and origins only.
 */
export class ClaudeMcpStatusService {
  private plugins: { name: string; path: string }[] = []
  private pluginServers: Promise<PluginMcpServerFact[]> | null = null
  private lastRecorded: string | null = null

  constructor(
    private readonly record: (fact: McpStatusFact) => void,
    private readonly now: () => string,
    private readonly readText: (path: string) => Promise<string> = (path) =>
      fs.readFile(path, 'utf8'),
    private readonly realPath: (path: string) => Promise<string> = (path) =>
      fs.realpath(path),
  ) {}

  /**
   * A start record begins a new reading: its plugins are the ones loaded
   * now, and the first status after it is recorded even when it matches the
   * last one (the fold forgets a status at every start record).
   */
  observeInit(init: Record<string, unknown>): void {
    this.plugins = Array.isArray(init.plugins)
      ? init.plugins.flatMap((value) => {
          const r = claudeRecord(value)
          const name = claudeString(r?.name)
          const path = claudeString(r?.path)
          return name && path ? [{ name, path }] : []
        })
      : []
    this.pluginServers = null
    this.lastRecorded = null
  }

  /**
   * Read the status and record it when it changed. `isCurrent` is asked after
   * the await: a reading from a process that has since ended or been replaced
   * is dropped, never recorded as this conversation's present.
   */
  async refresh(
    transport: ClaudeTransport,
    isCurrent: () => boolean,
  ): Promise<void> {
    const [statuses, pluginServers] = await Promise.all([
      transport.mcpServerStatus(),
      (this.pluginServers ??= this.readPluginServers()),
    ])
    if (!isCurrent()) return
    const fact = readClaudeMcpStatus(statuses, pluginServers, this.now())
    const signature = JSON.stringify([
      fact.servers,
      fact.omitted,
      fact.omittedAlerts,
      fact.pluginServers,
    ])
    if (signature === this.lastRecorded) return
    this.lastRecorded = signature
    this.record(fact)
  }

  private async readPluginServers(): Promise<PluginMcpServerFact[]> {
    const read = (path: string) => this.readText(path).catch(() => null)
    const perPlugin = await Promise.all(
      this.plugins.map(async (plugin) => {
        // `.mcp.json` may hold its servers at the top level; `plugin.json`
        // only under `mcpServers`, inline or as paths inside the plugin
        // (MAR-3206 R9).
        const manifest = pluginJsonMcpServers(
          await read(join(plugin.path, '.claude-plugin', 'plugin.json')),
        )
        const referenced = await Promise.all(
          manifest.paths.map(async (path) => {
            const inside = await this.insidePlugin(plugin.path, path)
            return inside ? mcpJsonServerBlock(await read(inside)) : null
          }),
        )
        return readPluginMcpServers(plugin.name, [
          mcpJsonServerBlock(await read(join(plugin.path, '.mcp.json'))),
          manifest.block,
          ...referenced,
        ])
      }),
    )
    return perPlugin.flat()
  }

  /**
   * A manifest's path inside its plugin, or null when it leaves the plugin:
   * refused on the text first, then again after links are resolved.
   */
  private async insidePlugin(
    root: string,
    path: string,
  ): Promise<string | null> {
    const resolved = pluginRootPath(root, path)
    if (!resolved) return null
    try {
      const [realRoot, realTarget] = await Promise.all([
        this.realPath(root),
        this.realPath(resolved),
      ])
      return isInsidePath(realRoot, realTarget) ? realTarget : null
    } catch {
      return null
    }
  }
}
