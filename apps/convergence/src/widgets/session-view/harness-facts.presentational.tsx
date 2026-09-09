import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '@/shared/ui/dropdown-menu'
import {
  harnessPill,
  compactionLabel,
  isMcpAlertStatus,
} from './harness-facts.pure'

export function HarnessFactsView({
  facts,
  error,
  loading,
  onRetry,
}: {
  facts: SessionHarnessFacts | null
  error: string | null
  loading: boolean
  onRetry: () => void
}) {
  const pill = harnessPill(facts),
    current = facts?.currentTurn,
    init = facts?.init,
    rate = facts?.rateLimit
  const hasFacts = !!(
    init ||
    rate ||
    facts?.compactions.length ||
    current?.hooks.length ||
    current?.retries ||
    current?.denials?.length
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-7 rounded-full border px-2 text-[11px] ${pill.alert ? 'border-destructive/50 text-destructive' : 'border-border/70 text-muted-foreground'}`}
          data-testid="harness-pill"
          data-alert={pill.alert}
        >
          {pill.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] overflow-auto p-3 text-xs"
      >
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
            {init.claudeCodeVersion !== null && (
              <p>Claude Code {init.claudeCodeVersion}</p>
            )}
            {init.model !== null && <p>Model: {init.model}</p>}
            {init.permissionMode !== null && (
              <p>Permission mode: {init.permissionMode}</p>
            )}
            {init.mcpServers !== null && (
              <div className="mt-2">
                MCP servers
                {init.mcpServers.map((server) => (
                  <p
                    key={server.name}
                    className={
                      isMcpAlertStatus(server.status) ? 'text-destructive' : ''
                    }
                  >
                    {server.name} · {server.status ?? 'Not reported'}
                  </p>
                ))}
              </div>
            )}
            {init.plugins !== null && (
              <div className="mt-2">
                Plugins
                {init.plugins.map((plugin) => (
                  <p key={`${plugin.name}:${plugin.path}`}>
                    {plugin.name}
                    {plugin.version ? ` · ${plugin.version}` : ''}
                    {plugin.path ? ` · ${plugin.path}` : ''}
                  </p>
                ))}
              </div>
            )}
            {init.capabilities !== null && (
              <p className="mt-2">
                Capabilities: {init.capabilities.join(', ') || 'None reported'}
              </p>
            )}
            {init.skillsCount !== null && <p>Skills: {init.skillsCount}</p>}
            {init.slashCommandsCount !== null && (
              <p>Slash commands: {init.slashCommandsCount}</p>
            )}
          </section>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
