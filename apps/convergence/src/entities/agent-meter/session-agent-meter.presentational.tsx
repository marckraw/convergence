import { Tooltip } from '@convergence/ui'
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
  // The header's Details row: a 16 px glyph column, an 88 px term, the value.
  return (
    <Tooltip label="Agent CPU and memory. Standalone one-shot and per-turn agents are not metered.">
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
        data-testid="session-agent-meter"
      >
        <span className="w-4 shrink-0" />
        <span className="w-22 shrink-0 text-ink-muted">CPU / memory</span>
        <span className="min-w-0 flex-1 truncate text-right tabular-nums text-ink">
          {formatSessionMeter(row ?? undefined, remote)}
        </span>
      </div>
    </Tooltip>
  )
}
