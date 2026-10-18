import { HostUsagePopover } from './host-usage-popover.presentational'
import type { HostUsagePillView } from './host-usage-pill.pure'
import { useHoverPopover } from './use-hover-popover'

/**
 * The host usage pill's state (MAR-4272): the panel a resting pointer opens
 * and a leaving one closes a moment later, as the Codex pill's.
 * HostUsagePopover draws it.
 */
export function HostUsagePillContainer({ view }: { view: HostUsagePillView }) {
  const { open, setOpen, openPanel, closePanelSoon } = useHoverPopover()
  return (
    <HostUsagePopover
      view={view}
      open={open}
      onOpenChange={setOpen}
      onOpenPanel={openPanel}
      onClosePanelSoon={closePanelSoon}
    />
  )
}
