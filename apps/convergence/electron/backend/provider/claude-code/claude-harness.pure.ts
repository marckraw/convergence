import type {
  HarnessFact,
  HarnessOutput,
  McpServerFact,
  PluginMcpServerFact,
} from '../../../../src/shared/types/harness-facts.types'
import {
  isAbsolute as isAbsolutePath,
  relative as relativePath,
  resolve as resolvePath,
  sep as pathSeparator,
} from 'path'
import { claudeRecord, claudeString } from './claude-evidence.pure'

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const boolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null
const strings = (value: unknown): string[] | null =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : null

/** Decode only reported harness facts; missing fields remain unknown. */
export function readClaudeHarnessFact(
  data: unknown,
  at: string,
): HarnessFact | null {
  const e = claudeRecord(data)
  const fieldBounds: NonNullable<HarnessFact['fieldBounds']> = {}
  const text = (field: string, value: unknown, budget = 64): string | null => {
    if (typeof value !== 'string') return null
    const bounded = boundHarnessText(value, budget)
    if (typeof bounded === 'string') return bounded
    fieldBounds[field] = {
      truncated: true,
      bytes: (fieldBounds[field]?.bytes ?? 0) + bounded.bytes,
    }
    return bounded.preview
  }
  const boundedFact = <T extends HarnessFact>(fact: T): T =>
    Object.keys(fieldBounds).length ? { ...fact, fieldBounds } : fact
  if (!e) return null
  if (e.type === 'rate_limit_event') {
    const r = claudeRecord(e.rate_limit_info) ?? {}
    return boundedFact({
      kind: 'harness.rateLimit',
      at,
      status: text('status', r.status),
      type: text('rateLimitType', r.rateLimitType),
      utilization: number(r.utilization),
      resetsAt: number(r.resetsAt),
      overageStatus: text('overageStatus', r.overageStatus),
      overageResetsAt: number(r.overageResetsAt),
      overageDisabledReason: text(
        'overageDisabledReason',
        r.overageDisabledReason,
      ),
      isUsingOverage: boolean(r.isUsingOverage),
      overageInUse: boolean(r.overageInUse),
      surpassedThreshold: number(r.surpassedThreshold),
    })
  }
  if (e.type !== 'system') return null
  if (
    ['hook_started', 'hook_progress', 'hook_response'].includes(
      String(e.subtype),
    )
  ) {
    return boundedFact({
      kind: 'harness.hook',
      at,
      hookId: text('hookId', e.hook_id),
      hookName: text('hookName', e.hook_name),
      hookEvent: text('hookEvent', e.hook_event),
      phase:
        e.subtype === 'hook_started'
          ? 'started'
          : e.subtype === 'hook_progress'
            ? 'progress'
            : 'response',
      status:
        e.subtype !== 'hook_response'
          ? null
          : e.outcome === 'cancelled'
            ? 'cancelled'
            : e.exit_code === 2
              ? 'blocked'
              : e.outcome === 'success'
                ? 'ok'
                : e.outcome === 'error'
                  ? 'failed'
                  : null,
      output:
        typeof e.output === 'string' ? boundHarnessText(e.output, 4096) : null,
    })
  }
  if (e.subtype === 'api_retry')
    return boundedFact({
      kind: 'harness.retry',
      phase: 'attempt',
      at,
      attempt: number(e.attempt),
      maxRetries: number(e.max_retries),
      retryDelayMs: number(e.retry_delay_ms),
      errorStatus: number(e.error_status),
      message: text('message', e.error, 512),
      noResponse: boolean(e.no_response),
    })
  if (e.subtype === 'compact_boundary') {
    const c = claudeRecord(e.compact_metadata) ?? {}
    return boundedFact({
      kind: 'harness.compaction',
      at,
      trigger: text('trigger', c.trigger),
      preTokens: number(c.pre_tokens),
      postTokens: number(c.post_tokens),
      durationMs: number(c.duration_ms),
    })
  }
  if (e.subtype === 'permission_denied') {
    const toolUseId = text('toolUseId', e.tool_use_id)
    return boundedFact({
      kind: 'harness.denial',
      ...(toolUseId ? { toolUseId } : {}),
      at,
      toolName: text('toolName', e.tool_name),
      reasonType: text('reasonType', e.decision_reason_type),
      reason: text('reason', e.decision_reason, 1024),
    })
  }
  if (e.subtype === 'init') {
    const servers = Array.isArray(e.mcp_servers)
      ? e.mcp_servers.map((value) => {
          const r = claudeRecord(value),
            name = claudeString(r?.name) ?? 'unnamed'
          return { name, status: claudeString(r?.status) }
        })
      : null
    const isAlert = (status: string | null) =>
      status === 'failed' || status === 'needs-auth'
    const others =
      servers
        ?.filter((server) => server.status !== 'connected')
        .sort(
          (a, b) => Number(isAlert(b.status)) - Number(isAlert(a.status)),
        ) ?? []
    // The connected servers by NAME (MAR-3213): the count alone left the
    // panel unable to say WHICH servers the session loaded, so the two
    // truths (the CLI's one-shot list vs the running conversation's) could
    // only be told apart by subtraction. Connected only — `pending` and
    // failing servers stay in `others`, where their statuses live.
    const connectedList =
      servers?.filter((server) => server.status === 'connected') ?? []
    const plugins = Array.isArray(e.plugins) ? e.plugins : null
    const capabilities = strings(e.capabilities)
    return boundedFact({
      kind: 'harness.init',
      at,
      claudeCodeVersion: text('claudeCodeVersion', e.claude_code_version),
      model: text('model', e.model),
      permissionMode: text('permissionMode', e.permissionMode),
      mcpServers: servers
        ? {
            total: servers.length,
            connected: servers.length - others.length,
            // Emitted only when a connected server exists, so an init with
            // nothing connected stays byte-identical to the facts written
            // before these fields existed (MAR-3213 R4: the existing
            // shape-pinned tests stay green untouched).
            ...(connectedList.length > 0 && {
              connectedNames: connectedList
                .slice(0, 16)
                .map((server) => text('mcpServers', server.name, 48)!),
              connectedOmitted: Math.max(0, connectedList.length - 16),
            }),
            others: others.slice(0, 16).map((server) => ({
              name: text('mcpServers', server.name, 48)!,
              status: text('mcpServers', server.status),
            })),
            omitted: Math.max(0, others.length - 16),
            omittedAlerts: others
              .slice(16)
              .filter((server) => isAlert(server.status)).length,
          }
        : null,
      plugins: plugins
        ? {
            count: plugins.length,
            names: plugins
              .slice(0, 16)
              .map(
                (value) =>
                  text(
                    'plugins',
                    claudeString(claudeRecord(value)?.name) ?? 'unnamed',
                    48,
                  )!,
              ),
            omitted: Math.max(0, plugins.length - 16),
          }
        : null,
      capabilities: capabilities
        ? {
            values: capabilities
              .slice(0, 32)
              .map((value) => text('capabilities', value, 32)!),
            omitted: Math.max(0, capabilities.length - 32),
          }
        : null,
      tools: Array.isArray(e.tools) ? { count: e.tools.length } : null,
      skills: Array.isArray(e.skills) ? { count: e.skills.length } : null,
      slashCommands: Array.isArray(e.slash_commands)
        ? { count: e.slash_commands.length }
        : null,
    })
  }
  return null
}

/**
 * A server's address as its origin only (MAR-3206 R1): `https://host[:port]`.
 * The path, the query and any credentials in the URL are never recorded; a
 * value that is not an http(s) URL has no address.
 */
export function mcpOrigin(url: unknown): string | null {
  if (typeof url !== 'string') return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  return parsed.origin
}

const MCP_STATUS_SERVERS = 20
const MCP_STATUS_PLUGIN_SERVERS = 8

/** A plugin server's name in the running process's status. */
export function pluginMcpServerName(plugin: string, server: string): string {
  return `plugin:${plugin}:${server}`
}

/**
 * The resident query's `mcpServerStatus()` as a fact (MAR-3206 R1): name,
 * status, scope and origin per server. Bounded so the recorded envelope stays
 * under its 8192-byte budget (`boundedHarnessPayload`): the fact names 20
 * servers and counts the rest, and every text field has its own bound.
 *
 * What the bound would falsify is decided before it (R7, R10): the connected
 * count is taken over every server, a name cut by its bound says so, and
 * whether a plugin's declared server was loaded is read from the whole
 * status -- never from recorded names a bound may have cut or dropped.
 */
export function readClaudeMcpStatus(
  statuses: unknown,
  pluginServers: readonly PluginMcpServerFact[],
  at: string,
): Extract<HarnessFact, { kind: 'harness.mcpStatus' }> {
  const entries = Array.isArray(statuses) ? statuses : []
  const bounded = (
    value: unknown,
    budget: number,
  ): { text: string; truncated: boolean } | null => {
    const raw = claudeString(value)
    if (raw === null) return null
    const result = boundHarnessText(raw, budget)
    return typeof result === 'string'
      ? { text: result, truncated: false }
      : { text: result.preview, truncated: true }
  }
  const text = (value: unknown, budget: number): string | null =>
    bounded(value, budget)?.text ?? null
  const loadedNames = new Set<string>()
  const listed: McpServerFact[] = entries.map((value) => {
    const r = claudeRecord(value)
    const rawName = claudeString(r?.name)
    if (rawName !== null) loadedNames.add(rawName)
    const name = bounded(rawName, 64)
    return {
      name: name?.text ?? 'unnamed',
      status: text(r?.status, 24),
      scope: text(r?.scope, 24),
      origin: text(mcpOrigin(claudeRecord(r?.config)?.url), 96),
      ...(name?.truncated ? { nameTruncated: true as const } : {}),
    }
  })
  // Failing and needs-sign-in servers first, as the start record orders its
  // own list: the bound drops quiet servers before it drops an alert.
  const isAlert = (server: McpServerFact) =>
    server.status === 'failed' || server.status === 'needs-auth'
  const servers = [...listed].sort(
    (a, b) => Number(isAlert(b)) - Number(isAlert(a)),
  )
  // A declared server the process did not load first: only those can be
  // hidden, so the bound drops a loaded one before it drops one of them.
  const declared = pluginServers
    .map((entry) => ({
      entry,
      loaded: loadedNames.has(pluginMcpServerName(entry.plugin, entry.server)),
    }))
    .sort((a, b) => Number(a.loaded) - Number(b.loaded))
  return {
    kind: 'harness.mcpStatus',
    at,
    servers: servers.slice(0, MCP_STATUS_SERVERS),
    connected: listed.filter((server) => server.status === 'connected').length,
    omitted: Math.max(0, servers.length - MCP_STATUS_SERVERS),
    omittedAlerts: servers.slice(MCP_STATUS_SERVERS).filter(isAlert).length,
    pluginServers: declared
      .slice(0, MCP_STATUS_PLUGIN_SERVERS)
      .map(({ entry, loaded }) => ({
        plugin: text(entry.plugin, 64) ?? 'unnamed',
        server: text(entry.server, 64) ?? 'unnamed',
        origin: text(entry.origin, 96) ?? entry.origin,
        loaded,
      })),
  }
}

/**
 * The server block of an `.mcp.json`-shaped file: `{ mcpServers: {...} }`,
 * or the servers at its top level. Null for text that is not a JSON object.
 */
export function mcpJsonServerBlock(
  text: string | null,
): Record<string, unknown> | null {
  const root = parseJsonRecord(text)
  return claudeRecord(root?.mcpServers) ?? root
}

/**
 * What a plugin's `.claude-plugin/plugin.json` declares under `mcpServers`
 * (MAR-3206 R9), and nothing else: an object is the server block itself; a
 * string (or strings) names an `.mcp.json`-shaped file inside the plugin.
 * The manifest's other keys (`author`, `homepage`, ...) are never servers.
 */
export function pluginJsonMcpServers(text: string | null): {
  block: Record<string, unknown> | null
  paths: string[]
} {
  const declared = parseJsonRecord(text)?.mcpServers
  if (typeof declared === 'string') return { block: null, paths: [declared] }
  if (Array.isArray(declared))
    return {
      block: null,
      paths: declared.filter(
        (entry): entry is string => typeof entry === 'string',
      ),
    }
  return { block: claudeRecord(declared), paths: [] }
}

/**
 * A manifest path resolved against the plugin root, or null when it leaves
 * that root (MAR-3206 R9): `../x`, an absolute path elsewhere, the root itself.
 */
export function pluginRootPath(root: string, path: string): string | null {
  const resolved = resolvePath(root, path)
  return isInsidePath(root, resolved) ? resolved : null
}

/** Whether `target` lies strictly inside `root` (both absolute). */
export function isInsidePath(root: string, target: string): boolean {
  const rel = relativePath(root, target)
  return (
    rel !== '' &&
    rel !== '..' &&
    !rel.startsWith(`..${pathSeparator}`) &&
    !isAbsolutePath(rel)
  )
}

/**
 * The http(s) servers one plugin declares, from its server blocks. Only each
 * server's name and origin leave this function -- headers and the rest of the
 * URL do not. The first block to name a server wins.
 */
export function readPluginMcpServers(
  plugin: string,
  blocks: readonly (Record<string, unknown> | null)[],
): PluginMcpServerFact[] {
  const found = new Map<string, PluginMcpServerFact>()
  for (const servers of blocks) {
    if (!servers) continue
    for (const [server, config] of Object.entries(servers)) {
      const origin = mcpOrigin(claudeRecord(config)?.url)
      if (origin && !found.has(server))
        found.set(server, { plugin, server, origin })
    }
  }
  return [...found.values()]
}

function parseJsonRecord(text: string | null): Record<string, unknown> | null {
  if (text === null) return null
  try {
    return claudeRecord(JSON.parse(text))
  } catch {
    return null
  }
}

/** Bound text in the envelope's JSON UTF-8 unit; never split a code point. */
export function boundHarnessText(
  output: string,
  budget: number,
): HarnessOutput {
  const bytes = Buffer.byteLength(output, 'utf8')
  if (Buffer.byteLength(JSON.stringify(output)) <= budget) return output
  let size = 2,
    preview = ''
  for (const point of output) {
    const next = Buffer.byteLength(JSON.stringify(point)) - 2
    if (size + next > budget) break
    size += next
    preview += point
  }
  return { truncated: true, bytes, preview }
}
