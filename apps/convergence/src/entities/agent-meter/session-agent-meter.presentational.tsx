import type { AgentMeterRow } from '@/shared/types/agent-meter.types'
import { formatSessionMeter } from './agent-meter.pure'

export function SessionAgentMeter({
  row,
  remote = false,
}: {
  row?: AgentMeterRow | null
  remote?: boolean
}) {
  if (!remote && !row?.usage) return null
  return (
    <span
      className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
      title="Agent CPU and memory. Standalone one-shot and per-turn agents are not metered."
      data-testid="session-agent-meter"
    >
      {formatSessionMeter(row ?? undefined, remote)}
    </span>
  )
}
