import type {
  HarnessFact,
  McpServerFact,
  RecordedPluginMcpServerFact,
  SessionHarnessFacts,
} from '../../shared/types/harness-facts.types'
export function harnessPill(facts: SessionHarnessFacts | null): {
  label: string
  alert: boolean
  reason: string | null
} {
  const current = facts?.currentTurn
  const retry = current?.retries
  const servers = facts?.init?.mcpServers
  // The running process's own status, when one was read after the start
  // record, is the newer truth: a server reconnected since then is no longer
  // an alert (MAR-3206 R3).
  const status = facts?.mcpStatus
  const alerts = (status ? status.servers : (servers?.others ?? [])).filter(
    (server) => isMcpAlertStatus(server.status),
  )
  const needsAuth = alerts.filter(
    (server) => server.status === 'needs-auth',
  ).length
  const failed = alerts.filter((server) => server.status === 'failed').length
  const needsAttention = alerts.length - needsAuth - failed
  const omitted = status ? status.omittedAlerts : (servers?.omittedAlerts ?? 0)
  const reasons: string[] = []
  if (needsAuth)
    reasons.push(
      `${needsAuth} integration${needsAuth === 1 ? ' needs' : 's need'} sign-in`,
    )
  if (failed)
    reasons.push(`${failed} integration${failed === 1 ? '' : 's'} failed`)
  if (needsAttention)
    reasons.push(
      `${needsAttention} integration${needsAttention === 1 ? ' needs' : 's need'} attention`,
    )
  // Omitted alerts carry a count, but no status breakdown. Do not guess it.
  if (omitted)
    reasons.push(
      `${omitted} more integration${omitted === 1 ? ' needs' : 's need'} attention`,
    )
  if (retry?.state === 'in-flight') reasons.push('retrying')
  const reason = reasons.length ? reasons.join(' · ') : null
  const parts = ['Harness']
  if (reason) parts.push(reason)
  if (current?.hooks.length) parts.push(`hooks ${current.hooks.length}`)
  if (retry && retry.state !== 'in-flight')
    parts.push(
      retry.state === 'failed'
        ? 'retry failed'
        : retry.state === 'unknown'
          ? 'retry ?'
          : `retry ${retry.attempts}`,
    )
  if (current?.denials?.length) parts.push(`denied ${current.denials.length}`)
  return { label: parts.join(' · '), alert: reason !== null, reason }
}
export function compactionLabel(
  fact: SessionHarnessFacts['compactions'][number],
): string {
  const format = (n: number) =>
    new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1,
    })
      .format(n)
      .toLowerCase()
  const counts =
    fact.preTokens !== null && fact.postTokens !== null
      ? ` · ${format(fact.preTokens)} → ${format(fact.postTokens)} tokens`
      : fact.preTokens !== null
        ? ` · ${format(fact.preTokens)} tokens before`
        : ''
  return `Compacted (${fact.trigger ?? 'not reported'})${counts}${fact.truncated ? ' · record truncated' : ''}${fact.fieldBounds ? ' · text truncated' : ''}`
}

export function placeCompactions(
  items: readonly { id: string; createdAt: string }[],
  compactions: SessionHarnessFacts['compactions'],
  windowStartedAt?: string,
) {
  const before = new Map<string, SessionHarnessFacts['compactions']>(),
    tail: SessionHarnessFacts['compactions'] = []
  const byTime = [...items].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )
  for (const fact of [...compactions].sort(
    (a, b) => a.at.localeCompare(b.at) || a.sequence - b.sequence,
  )) {
    // A compaction before a partial window is not attached to its first row.
    if (windowStartedAt !== undefined && fact.at < windowStartedAt) continue
    const next = byTime.find((item) => item.createdAt >= fact.at)
    if (next) before.set(next.id, [...(before.get(next.id) ?? []), fact])
    else tail.push(fact)
  }
  return { before, tail }
}

export function isMcpAlertStatus(status: string | null): boolean {
  return status === 'failed' || status === 'needs-auth'
}

export interface HiddenPluginServer {
  /** The claude.ai connector, e.g. `claude.ai Figma`. */
  connector: string
  plugin: string
  server: string
  origin: string
}

/**
 * The plugin servers a claude.ai connector is hiding (MAR-3206 R2): a
 * connector in `needs-auth` at the same origin as a server a loaded plugin
 * declares, while the running process did not load that plugin server. The
 * harness drops the plugin's copy of a duplicate address, so the one that
 * survives cannot be used until it is authorized.
 *
 * Matched by ORIGIN, never by name: `claude.ai Figma` and the `figma` plugin
 * share a word by coincidence, and it is the address the harness compares.
 * Whether the plugin server was loaded is the recorded `loaded`, decided on
 * the whole status before any bound (R10) -- a recorded name may be a prefix.
 */
export function hiddenPluginServers(
  status: readonly McpServerFact[],
  plugins: readonly RecordedPluginMcpServerFact[],
): HiddenPluginServer[] {
  return status.flatMap((connector) =>
    connector.scope === 'claudeai' &&
    connector.status === 'needs-auth' &&
    connector.origin !== null
      ? plugins
          .filter(
            (plugin) => plugin.origin === connector.origin && !plugin.loaded,
          )
          .map((plugin) => ({
            connector: connector.name,
            plugin: plugin.plugin,
            server: plugin.server,
            origin: connector.origin!,
          }))
      : [],
  )
}

/** The one sentence Details says for a hidden plugin server, with the fix. */
export function hiddenPluginSentence(hidden: HiddenPluginServer): string {
  const service = hidden.connector.replace(/^claude\.ai\s+/, '')
  const plugin = hidden.plugin.charAt(0).toUpperCase() + hidden.plugin.slice(1)
  return `${hidden.connector} needs sign-in and is hiding the ${plugin} plugin's server (same address). Authorize ${service} at claude.ai → Settings → Connectors, then Reconnect.`
}

/** A refused MCP refresh or reconnect, without the IPC wrapper's prefix. */
export function mcpRefusal(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(
    /^Error invoking remote method ['"]session:refreshMcpServers['"]: (?:Error: )?/,
    '',
  )
}

const NO_PROCESS =
  'no process is running; the next message starts one and reads its connectors afresh'

/** Why Details cannot reconnect a server, or null when it can (MAR-3206 R3). */
export function mcpReconnectUnavailable(
  canReconnect: boolean | undefined,
): string | null {
  return canReconnect ? null : NO_PROCESS
}

/**
 * The MCP list's heading (MAR-3206 R5, R7, R13): the connected count over the
 * whole status, since when it has been unchanged, and whether a process runs
 * now -- a status outlives the process it was read from, and says so
 * whenever none runs. `running` is null when the caller cannot tell.
 *
 * The time is the status's own: an unchanged re-read records nothing, so the
 * time is when the list last changed, never when it was last read.
 */
export function mcpStatusHeading(
  status: Extract<HarnessFact, { kind: 'harness.mcpStatus' }>,
  running: boolean | null,
): string {
  const since = new Date(status.at)
  const parts = [
    `MCP servers · ${status.connected} connected of ${status.servers.length + status.omitted}`,
    `unchanged since ${Number.isNaN(since.getTime()) ? status.at : since.toLocaleTimeString()}`,
  ]
  if (running !== null) parts.push(running ? 'process running' : NO_PROCESS)
  return parts.join(' · ')
}

/**
 * A failed Reconnect's error, while it still describes the latest status
 * (MAR-3206 R6): only as long as that server is still listed as an alert.
 */
export function mcpReconnectErrorFor<
  E extends { server: string; message: string },
>(
  error: E | null,
  status:
    | Pick<Extract<HarnessFact, { kind: 'harness.mcpStatus' }>, 'servers'>
    | undefined,
): E | null {
  if (!error || !status) return null
  return status.servers.some(
    (server) => server.name === error.server && isMcpAlertStatus(server.status),
  )
    ? error
    : null
}
