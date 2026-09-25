import type { AgentMeterRow } from '@/shared/types/agent-meter.types'
import { formatSessionMeter } from './agent-meter.pure'

/**
 * The agent's CPU and memory as a named row of the header's Details
 * (MAR-3429 CH4 R3); it no longer holds a place in the header's row. No
 * reading draws nothing (CH1 R3).
 */
export function SessionAgentMeter({
  row,
  remote = false,
}: {
  row?: AgentMeterRow | null
  remote?: boolean
}) {
  if (!remote && !row?.usage) return null
  return (
    <div
      className="grid grid-cols-[1rem_5.5rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1.5 text-xs"
      title="Agent CPU and memory. Standalone one-shot and per-turn agents are not metered."
      data-testid="session-agent-meter"
    >
      <span />
      <span className="text-muted-foreground">CPU / memory</span>
      <span className="min-w-0 truncate text-right tabular-nums text-foreground">
        {formatSessionMeter(row ?? undefined, remote)}
      </span>
    </div>
  )
}
