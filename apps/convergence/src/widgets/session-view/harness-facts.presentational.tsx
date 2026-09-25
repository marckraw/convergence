import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { Button } from '@/shared/ui/button'
import {
  compactionLabel,
  hiddenPluginSentence,
  hiddenPluginServers,
  isMcpAlertStatus,
  mcpReconnectErrorFor,
  mcpStatusHeading,
} from './harness-facts.pure'

/** What Details can do with a server of the running process (MAR-3206 R3). */
export interface McpReconnectView {
  /** Why Reconnect is unavailable; null when a running process can take it. */
  unavailable: string | null
  /** The server a reconnect is under way for. */
  pending: string | null
  error: { server: string; message: string } | null
  onReconnect: (server: string) => void
}

/**
 * The harness history -- hooks, retries, denials, compactions, the rate limit
 * and what the harness loaded -- as sections of the header's Details
 * (MAR-3429 CH4 R3). It was its own menu behind a permanent pill.
 */
export function HarnessFactsSections({
  facts,
  error,
  loading,
  onRetry,
  mcp,
}: {
  facts: SessionHarnessFacts | null
  error: string | null
  loading: boolean
  onRetry: () => void
  mcp?: McpReconnectView
}) {
  const current = facts?.currentTurn,
    init = facts?.init,
    rate = facts?.rateLimit,
    status = facts?.mcpStatus
  const hidden = status
    ? hiddenPluginServers(status.servers, status.pluginServers)
    : []
  // An error belongs to the status it was about (MAR-3206 R6).
  const mcpError = mcpReconnectErrorFor(mcp?.error ?? null, status)
  const hasFacts = !!(
    init ||
    status ||
    rate ||
    facts?.compactions.length ||
    current?.hooks.length ||
    current?.retries ||
    current?.denials?.length
  )
  return (
    <>
      {error ? (
        <div role="alert">
          {error}{' '}
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <p>Loading harness facts…</p>
      ) : !hasFacts ? (
        <p>No harness facts yet</p>
      ) : null}
      {!!current?.hooks.length && (
        <section aria-label="Hooks" className="mb-3">
          <h3 className="mb-1 font-medium">Hooks · current turn</h3>
          {current.hooks.map((hook) => (
            <div
              key={hook.id}
              className="mb-2 rounded border border-border p-2"
            >
              <div>
                {hook.name ?? 'Name not reported'} ·{' '}
                {hook.event ?? 'Event not reported'}
              </div>
              <div>
                {hook.status}
                {hook.truncated ? ' · record truncated' : ''}
                {hook.durationMs !== null ? ` · ${hook.durationMs} ms` : ''}
              </div>
              {hook.fieldBounds && <p>Hook text truncated</p>}
              {hook.output !== null && (
                <details>
                  <summary className="cursor-pointer">
                    Output
                    {typeof hook.output === 'object' ? ' · truncated' : ''}
                  </summary>
                  <pre className="whitespace-pre-wrap break-words">
                    {typeof hook.output === 'string'
                      ? hook.output
                      : hook.output.preview}
                  </pre>
                  {typeof hook.output === 'object' && (
                    <span>{hook.output.bytes} bytes reported</span>
                  )}
                </details>
              )}
            </div>
          ))}
        </section>
      )}
      {current?.retries && (
        <section aria-label="Retries" className="mb-3">
          <h3 className="font-medium">Retries · current turn</h3>
          <p>
            {current.retries.last.truncated
              ? 'Retry record truncated'
              : `${current.retries.attempts} attempts · ${current.retries.state}`}
          </p>
          {current.retries.last.fieldBounds && <p>Retry text truncated</p>}
          {current.retries.last.phase === 'attempt' ? (
            <p>
              {current.retries.last.message}
              {current.retries.last.retryDelayMs !== null
                ? ` · delay ${current.retries.last.retryDelayMs} ms`
                : ''}
              {current.retries.last.errorStatus !== null
                ? ` · HTTP ${current.retries.last.errorStatus}`
                : ''}
            </p>
          ) : current.retries.last.phase === 'resolved' &&
            current.retries.last.errorSubtype ? (
            <p>{current.retries.last.errorSubtype}</p>
          ) : null}
        </section>
      )}
      {!!current?.denials?.length && (
        <section aria-label="Denials" className="mb-3">
          <h3 className="font-medium">
            Denials · current turn ({current.denials.length})
          </h3>
          {current.denials.map((denial, index) => (
            <p key={index}>
              {denial.toolName ?? 'Tool not reported'}
              {denial.truncated ? ' · record truncated' : ''}
              {denial.fieldBounds ? ' · text truncated' : ''}
              {denial.reasonType ? ` · ${denial.reasonType}` : ''}
              {denial.reason ? ` · ${denial.reason}` : ''}
            </p>
          ))}
        </section>
      )}
      {!!facts?.compactions.length && (
        <section aria-label="Compactions" className="mb-3">
          <h3 className="font-medium">Compactions</h3>
          {facts.compactions.map((fact) => (
            <p key={fact.sequence}>
              {compactionLabel(fact)}
              {fact.durationMs !== null ? ` · ${fact.durationMs} ms` : ''}
            </p>
          ))}
        </section>
      )}
      {rate && (
        <section aria-label="Rate limit" className="mb-3">
          <h3 className="font-medium">Rate limit · last reported</h3>
          {rate.truncated && <p>Rate limit record truncated</p>}
          {rate.fieldBounds && <p>Rate limit text truncated</p>}
          {[
            ['Status', rate.status],
            ['Limit', rate.type],
            [
              'Utilization',
              rate.utilization === null
                ? null
                : `${Math.round(rate.utilization * 100)}%`,
            ],
            [
              'Resets',
              rate.resetsAt === null
                ? null
                : new Date(rate.resetsAt * 1000).toLocaleString(),
            ],
            ['Overage status', rate.overageStatus],
            [
              'Overage resets',
              rate.overageResetsAt === null
                ? null
                : new Date(rate.overageResetsAt * 1000).toLocaleString(),
            ],
            ['Overage unavailable', rate.overageDisabledReason],
            [
              'Using overage',
              rate.isUsingOverage === null
                ? null
                : rate.isUsingOverage
                  ? 'Yes'
                  : 'No',
            ],
            [
              'Overage in use',
              rate.overageInUse === null
                ? null
                : rate.overageInUse
                  ? 'Yes'
                  : 'No',
            ],
            ['Threshold exceeded', rate.surpassedThreshold],
            ['Reported', rate.at],
          ]
            .filter(([, value]) => value !== null)
            .map(([label, value]) => (
              <p key={label}>
                {label}: {value}
              </p>
            ))}
        </section>
      )}
      {init && (
        <section aria-label="Harness">
          <h3 className="font-medium">Harness</h3>
          {init.truncated && <p>Harness record truncated</p>}
          {init.fieldBounds && <p>Some reported text was truncated.</p>}
          {init.claudeCodeVersion !== null && (
            <p>Claude Code {init.claudeCodeVersion}</p>
          )}
          {init.model !== null && <p>Model: {init.model}</p>}
          {init.permissionMode !== null && (
            <p>Permission mode: {init.permissionMode}</p>
          )}
          {status ? (
            <div className="mt-2" aria-label="MCP servers">
              <p>
                {mcpStatusHeading(
                  status,
                  mcp ? mcp.unavailable === null : null,
                )}
              </p>
              {hidden.map((entry) => (
                <p
                  key={`${entry.connector}:${entry.plugin}:${entry.server}`}
                  role="note"
                  className="text-destructive"
                >
                  {hiddenPluginSentence(entry)}
                </p>
              ))}
              {status.servers.map((server, index) => (
                <div
                  key={`${index}:${server.name}`}
                  className="flex items-center gap-2"
                >
                  <p
                    className={
                      isMcpAlertStatus(server.status) ? 'text-destructive' : ''
                    }
                  >
                    {server.name}
                    {server.nameTruncated ? '…' : ''} ·{' '}
                    {server.status ?? 'Not reported'} ·{' '}
                    {server.scope ?? 'scope not reported'} ·{' '}
                    {server.origin ?? 'no address'}
                  </p>
                  {mcp &&
                    isMcpAlertStatus(server.status) &&
                    server.nameTruncated && (
                      <span>name too long to reconnect from here</span>
                    )}
                  {mcp &&
                    isMcpAlertStatus(server.status) &&
                    !server.nameTruncated && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={
                          mcp.unavailable !== null || mcp.pending !== null
                        }
                        title={mcp.unavailable ?? undefined}
                        aria-label={`Reconnect ${server.name}`}
                        onClick={() => mcp.onReconnect(server.name)}
                      >
                        {mcp.pending === server.name
                          ? 'Reconnecting…'
                          : 'Reconnect'}
                      </Button>
                    )}
                </div>
              ))}
              {status.omitted > 0 && (
                <p>{`… and ${status.omitted} more (${status.omittedAlerts} failed or needing auth)`}</p>
              )}
              {mcpError && (
                <p role="alert" className="text-destructive">
                  Reconnect {mcpError.server} failed: {mcpError.message}
                </p>
              )}
            </div>
          ) : (
            init.mcpServers !== null && (
              <div className="mt-2">
                MCP servers · {init.mcpServers.connected} connected of{' '}
                {init.mcpServers.total}
                {/* Which servers the session actually loaded (MAR-3213) —
                absent on facts recorded before the change, and then
                nothing extra renders. */}
                {!!init.mcpServers.connectedNames?.length && (
                  <p>Connected: {init.mcpServers.connectedNames.join(', ')}</p>
                )}
                {(init.mcpServers.connectedOmitted ?? 0) > 0 && (
                  <p>{`… and ${init.mcpServers.connectedOmitted} more connected`}</p>
                )}
                {init.mcpServers.others.map((server, index) => (
                  <p
                    key={`${index}:${server.name}`}
                    className={
                      isMcpAlertStatus(server.status) ? 'text-destructive' : ''
                    }
                  >
                    {server.name} · {server.status ?? 'Not reported'}
                  </p>
                ))}
                {init.mcpServers.omitted > 0 && (
                  <p>{`… and ${init.mcpServers.omitted} more not connected (${init.mcpServers.omittedAlerts} failed or needing auth)`}</p>
                )}
              </div>
            )
          )}
          {init.plugins !== null && (
            <div className="mt-2">
              Plugins · {init.plugins.count}
              {init.plugins.names.map((name, index) => (
                <p key={`${index}:${name}`}>{name}</p>
              ))}
              {init.plugins.omitted > 0 && (
                <p>… and {init.plugins.omitted} more plugins</p>
              )}
            </div>
          )}
          {init.capabilities !== null && (
            <p className="mt-2">
              Capabilities:{' '}
              {init.capabilities.values.join(', ') || 'None reported'}
              {init.capabilities.omitted > 0 && (
                <> · {init.capabilities.omitted} more capabilities</>
              )}
            </p>
          )}
          {init.tools !== null && <p>Tools: {init.tools.count}</p>}
          {init.skills !== null && <p>Skills: {init.skills.count}</p>}
          {init.slashCommands !== null && (
            <p>Slash commands: {init.slashCommands.count}</p>
          )}
        </section>
      )}
    </>
  )
}
