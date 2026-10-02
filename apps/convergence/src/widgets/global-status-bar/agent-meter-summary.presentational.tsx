import type { AgentMeterSnapshot } from '@/shared/types/agent-meter.types'
import { formatMeterUsage, formatSessionMeter } from '@/entities/agent-meter'
import type { SessionSummary } from '@/entities/session'
import { isRemoteExecutionHost } from '@/entities/execution-host'
import { TooltipCard } from '@convergence/ui'

export function AgentMeterSummary({
  snapshot,
  sessions,
}: {
  snapshot: AgentMeterSnapshot
  sessions: SessionSummary[]
}) {
  const rows = snapshot.rows.toSorted(
    (a, b) => (b.usage?.cpu ?? -1) - (a.usage?.cpu ?? -1),
  )
  const remote = sessions.filter(
    (session) =>
      isRemoteExecutionHost(session.executionHost) &&
      session.status === 'running',
  )
  return (
    <TooltipCard
      side="top"
      className="max-w-lg"
      content={
        <div className="space-y-1 tabular-nums" data-testid="agent-meter-list">
          {rows.map((row) => (
            <div key={row.sessionId}>
              {sessions.find((session) => session.id === row.sessionId)?.name ??
                'Conversation'}{' '}
              · {formatSessionMeter(row, false)}
            </div>
          ))}
          {remote.map((session) => (
            <div key={session.id}>{session.name} · remote</div>
          ))}
          {!rows.length && !remote.length && <div>No live metered agents</div>}
          <p className="text-2xs text-ink-muted">
            Shared servers count once in the total. Standalone one-shot and
            per-turn agents are not metered.
          </p>
        </div>
      }
    >
      <span
        tabIndex={0}
        className="shrink-0 whitespace-nowrap tabular-nums"
        data-testid="agent-meter-total"
      >
        Agents {formatMeterUsage(snapshot.agents)} · Convergence{' '}
        {formatMeterUsage(snapshot.convergence)}
      </span>
    </TooltipCard>
  )
}
