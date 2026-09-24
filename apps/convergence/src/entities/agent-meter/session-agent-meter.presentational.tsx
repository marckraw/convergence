import type { AgentMeterRow } from '@/shared/types/agent-meter.types'
import { formatSessionMeter } from './agent-meter.pure'

export function SessionAgentMeter({
  row,
  remote = false,
}: {
  row?: AgentMeterRow
  remote?: boolean
}) {
  return (
    <span
      className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
      title="Agent CPU and memory. Standalone one-shot and per-turn agents are not metered."
      data-testid="session-agent-meter"
    >
      {formatSessionMeter(row, remote)}
    </span>
  )
}
