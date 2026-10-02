import { DescriptionItem, DescriptionList, Tooltip } from '@convergence/ui'
import type { AgentMeterRow } from '@/shared/types/agent-meter.types'
import { formatSessionMeter } from './agent-meter.pure'

/**
 * The agent's CPU and memory as a named row of the header's Details
 * (MAR-3429 CH4 R3); it no longer holds a place in the header's row. No
 * reading draws nothing (CH1 R3). A DescriptionItem, inline and compact
 * (MC-16), with the empty glyph slot the Details rows keep, so it lines up
 * under them and in Loom's seat cards alike.
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
    <DescriptionList layout="inline" density="compact">
      <Tooltip label="Agent CPU and memory. Standalone one-shot and per-turn agents are not metered.">
        <DescriptionItem
          term="CPU / memory"
          icon={null}
          className="rounded-md px-2 py-1.5 tabular-nums"
          data-testid="session-agent-meter"
        >
          {formatSessionMeter(row ?? undefined, remote)}
        </DescriptionItem>
      </Tooltip>
    </DescriptionList>
  )
}
