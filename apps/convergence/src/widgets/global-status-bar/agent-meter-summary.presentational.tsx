import type { AgentMeterSnapshot } from '@/shared/types/agent-meter.types'
import { formatMeterUsage, formatSessionMeter } from '@/entities/agent-meter'
import type { SessionSummary } from '@/entities/session'
import { isRemoteExecutionHost } from '@/entities/execution-host'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

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
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="shrink-0 whitespace-nowrap tabular-nums"
          data-testid="agent-meter-total"
        >
          Agents {formatMeterUsage(snapshot.agents)} · Convergence{' '}
          {formatMeterUsage(snapshot.convergence)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-lg">
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
          <p className="text-[11px] opacity-70">
            Shared servers count once in the total. Standalone one-shot and
            per-turn agents are not metered.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
