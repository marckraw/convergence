import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import {
  Button,
  CodeBlock,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  DescriptionItem,
  DescriptionList,
  EmptyState,
  FormError,
  formatTimestamp,
  MetaLine,
  Timestamp,
} from '@convergence/ui'
import {
  compactionFacts,
  hiddenPluginSentence,
  hiddenPluginServers,
  isMcpAlertStatus,
  mcpReconnectErrorFor,
  mcpStatusHeading,
} from './harness-facts.pure'

/** The MCP status's time: Timestamp's clock, to the second (use-timestamp). */
const writeStatusTime = (at: Date) =>
  formatTimestamp(at, 'clock', { seconds: true })

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
      {/* One title for the block, including while startup facts are still
          absent (loading, an error, retries only). With init facts the
          section below is that same title, so there is still one (CH4 E). */}
      {!init && <h3 className="font-medium">Harness</h3>}
      {error ? (
        // R10: what failed, the reason under it, and one Retry (CONV-7).
        <div className="flex flex-col items-start gap-1">
          <FormError detail={error}>Couldn’t read the harness facts.</FormError>
          <Button variant="link" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <EmptyState
          state="loading"
          size="compact"
          variant="plain"
          title="Loading harness facts…"
        />
      ) : !hasFacts ? (
        <EmptyState
          size="compact"
          variant="plain"
          title="No harness facts yet"
        />
      ) : null}
      {!!current?.hooks.length && (
        <section aria-label="Hooks" className="mb-3">
          <h3 className="mb-1 font-medium">Hooks · current turn</h3>
          {current.hooks.map((hook) => (
            <div key={hook.id} className="mb-2 rounded border border-line p-2">
              <MetaLine wrap>
                {hook.name ?? 'Name not reported'}
                {hook.event ?? 'Event not reported'}
              </MetaLine>
              <MetaLine wrap>
                {hook.status}
                {hook.truncated ? 'record truncated' : null}
                {hook.durationMs !== null ? `${hook.durationMs} ms` : null}
              </MetaLine>
              {hook.fieldBounds && <p>Hook text truncated</p>}
              {hook.output !== null && (
                // The output folds in a Collapsible, in a CodeBlock (CONV-12, CONV-32).
                <Collapsible>
                  <CollapsibleTrigger className="text-ink-muted hover:text-ink">
                    <MetaLine>
                      Output
                      {typeof hook.output === 'object' ? 'truncated' : null}
                    </MetaLine>
                  </CollapsibleTrigger>
                  <CollapsiblePanel keepMounted>
                    <CodeBlock
                      label="Hook output"
                      maxHeight="sm"
                      wrap
                      className="mt-1"
                    >
                      {typeof hook.output === 'string'
                        ? hook.output
                        : hook.output.preview}
                    </CodeBlock>
                    {typeof hook.output === 'object' && (
                      <span>{hook.output.bytes} bytes reported</span>
                    )}
                  </CollapsiblePanel>
                </Collapsible>
              )}
            </div>
          ))}
        </section>
      )}
      {current?.retries && (
        <section aria-label="Retries" className="mb-3">
          <h3 className="font-medium">Retries · current turn</h3>
          {current.retries.last.truncated ? (
            <p>Retry record truncated</p>
          ) : (
            <MetaLine wrap>
              {`${current.retries.attempts} attempts`}
              {current.retries.state}
            </MetaLine>
          )}
          {current.retries.last.fieldBounds && <p>Retry text truncated</p>}
          {current.retries.last.phase === 'attempt' ? (
            <MetaLine wrap>
              {current.retries.last.message}
              {current.retries.last.retryDelayMs !== null
                ? `delay ${current.retries.last.retryDelayMs} ms`
                : null}
              {current.retries.last.errorStatus !== null
                ? `HTTP ${current.retries.last.errorStatus}`
                : null}
            </MetaLine>
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
            <MetaLine wrap key={index}>
              {denial.toolName ?? 'Tool not reported'}
              {denial.truncated ? 'record truncated' : null}
              {denial.fieldBounds ? 'text truncated' : null}
              {denial.reasonType}
              {denial.reason}
            </MetaLine>
          ))}
        </section>
      )}
      {!!facts?.compactions.length && (
        <section aria-label="Compactions" className="mb-3">
          <h3 className="font-medium">Compactions</h3>
          {facts.compactions.map((fact) => (
            <MetaLine wrap key={fact.sequence}>
              {compactionFacts(fact)}
              {fact.durationMs !== null ? `${fact.durationMs} ms` : null}
            </MetaLine>
          ))}
        </section>
      )}
      {rate && (
        <section aria-label="Rate limit" className="mb-3">
          <h3 className="font-medium">Rate limit · last reported</h3>
          {rate.truncated && <p>Rate limit record truncated</p>}
          {rate.fieldBounds && <p>Rate limit text truncated</p>}
          {/* Its readings as terms and values, its times as Timestamps (CONV-24, CONV-22). */}
          <DescriptionList layout="inline" density="compact">
            {(
              [
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
                  rate.resetsAt === null ? null : (
                    <Timestamp
                      date={new Date(rate.resetsAt * 1000)}
                      format="datetime"
                    />
                  ),
                ],
                ['Overage status', rate.overageStatus],
                [
                  'Overage resets',
                  rate.overageResetsAt === null ? null : (
                    <Timestamp
                      date={new Date(rate.overageResetsAt * 1000)}
                      format="datetime"
                    />
                  ),
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
                [
                  'Reported',
                  <Timestamp key="at" date={rate.at} format="datetime" />,
                ],
              ] as const
            )
              .filter(([, value]) => value !== null)
              .map(([label, value]) => (
                <DescriptionItem key={label} term={label}>
                  {value}
                </DescriptionItem>
              ))}
          </DescriptionList>
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
          {(init.model !== null || init.permissionMode !== null) && (
            <DescriptionList layout="inline" density="compact">
              {init.model !== null && (
                <DescriptionItem term="Model">{init.model}</DescriptionItem>
              )}
              {init.permissionMode !== null && (
                <DescriptionItem term="Permission mode">
                  {init.permissionMode}
                </DescriptionItem>
              )}
            </DescriptionList>
          )}
          {status ? (
            <div className="mt-2" aria-label="MCP servers">
              <p>
                <MetaLine wrap>
                  {mcpStatusHeading(
                    status,
                    mcp ? mcp.unavailable === null : null,
                    writeStatusTime,
                  )}
                </MetaLine>
              </p>
              {hidden.map((entry) => (
                <p
                  key={`${entry.connector}:${entry.plugin}:${entry.server}`}
                  role="note"
                  className="text-danger-ink"
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
                      isMcpAlertStatus(server.status) ? 'text-danger-ink' : ''
                    }
                  >
                    <MetaLine wrap>
                      {`${server.name}${server.nameTruncated ? '…' : ''}`}
                      {server.status ?? 'Not reported'}
                      {server.scope ?? 'scope not reported'}
                      {server.origin ?? 'no address'}
                    </MetaLine>
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
                        disabled={mcp.pending !== null}
                        disabledReason={mcp.unavailable ?? undefined}
                        aria-label={`Reconnect ${server.name}`}
                        onClick={() => mcp.onReconnect(server.name)}
                        size="xs"
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
                <FormError>
                  Couldn’t reconnect {mcpError.server}: {mcpError.message}
                </FormError>
              )}
            </div>
          ) : (
            init.mcpServers !== null && (
              <div className="mt-2">
                {/* Its readings as terms and values, as Tools and Skills
                    are (CONV-24). Which servers the session actually loaded
                    (MAR-3213) is absent on facts recorded before the change,
                    and then nothing extra renders; a long list wraps under
                    its term. */}
                <DescriptionList layout="inline" density="compact">
                  <DescriptionItem term="MCP servers">
                    {`${init.mcpServers.connected} connected of ${init.mcpServers.total}`}
                  </DescriptionItem>
                </DescriptionList>
                {!!init.mcpServers.connectedNames?.length && (
                  <DescriptionList density="compact" className="mt-1">
                    <DescriptionItem term="Connected">
                      {init.mcpServers.connectedNames.join(', ')}
                    </DescriptionItem>
                  </DescriptionList>
                )}
                {(init.mcpServers.connectedOmitted ?? 0) > 0 && (
                  <p>{`… and ${init.mcpServers.connectedOmitted} more connected`}</p>
                )}
                {init.mcpServers.others.map((server, index) => (
                  <p
                    key={`${index}:${server.name}`}
                    className={
                      isMcpAlertStatus(server.status) ? 'text-danger-ink' : ''
                    }
                  >
                    <MetaLine wrap>
                      {server.name}
                      {server.status ?? 'Not reported'}
                    </MetaLine>
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
              <DescriptionList layout="inline" density="compact">
                <DescriptionItem term="Plugins">
                  {init.plugins.count}
                </DescriptionItem>
              </DescriptionList>
              {init.plugins.names.map((name, index) => (
                <p key={`${index}:${name}`}>{name}</p>
              ))}
              {init.plugins.omitted > 0 && (
                <p>… and {init.plugins.omitted} more plugins</p>
              )}
            </div>
          )}
          {init.capabilities !== null && (
            // A long list: its value wraps under its term.
            <DescriptionList density="compact" className="mt-2">
              <DescriptionItem term="Capabilities">
                <MetaLine wrap>
                  {init.capabilities.values.join(', ') || 'None reported'}
                  {init.capabilities.omitted > 0
                    ? `${init.capabilities.omitted} more capabilities`
                    : null}
                </MetaLine>
              </DescriptionItem>
            </DescriptionList>
          )}
          {(init.tools !== null ||
            init.skills !== null ||
            init.slashCommands !== null) && (
            <DescriptionList layout="inline" density="compact" className="mt-2">
              {init.tools !== null && (
                <DescriptionItem term="Tools">
                  {init.tools.count}
                </DescriptionItem>
              )}
              {init.skills !== null && (
                <DescriptionItem term="Skills">
                  {init.skills.count}
                </DescriptionItem>
              )}
              {init.slashCommands !== null && (
                <DescriptionItem term="Slash commands">
                  {init.slashCommands.count}
                </DescriptionItem>
              )}
            </DescriptionList>
          )}
        </section>
      )}
    </>
  )
}
