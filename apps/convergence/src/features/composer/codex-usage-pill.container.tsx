import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import { CodexUsagePopover } from './codex-usage-popover.presentational'
import { useHoverPopover } from './use-hover-popover'

interface CodexUsagePillContainerProps {
  snapshot: ProviderQuotaSnapshot | null
  isLoading: boolean
  onRefresh: () => void
  onOpenSettings: () => void
}

/**
 * The Codex quota pill's state (CONV-30): the panel a resting pointer opens
 * and a leaving one closes a moment later. CodexUsagePopover draws it.
 */
export function CodexUsagePillContainer(props: CodexUsagePillContainerProps) {
  const { open, setOpen, openPanel, closePanelSoon } = useHoverPopover()
  return (
    <CodexUsagePopover
      {...props}
      open={open}
      onOpenChange={setOpen}
      onOpenPanel={openPanel}
      onClosePanelSoon={closePanelSoon}
    />
  )
}
