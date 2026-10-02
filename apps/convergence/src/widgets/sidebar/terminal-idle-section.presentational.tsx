import type { FC } from 'react'
import { Check, TerminalSquare } from 'lucide-react'
import type { TerminalIdleNotice } from '@/entities/terminal'
import { IconButton, ListRow, SectionHeader, Tooltip } from '@convergence/ui'

interface TerminalIdleSectionProps {
  notices: readonly TerminalIdleNotice[]
  onSelect: (notice: TerminalIdleNotice) => void | Promise<void>
  onDismiss: (terminalId: string) => void
}

/**
 * Terminals whose command finished: a section of the sidebar (SectionHeader,
 * NAV-12) whose rows open their session (ListRow, NAV-5), each with an
 * acknowledge that shows with its row and for the keyboard.
 */
export const TerminalIdleSection: FC<TerminalIdleSectionProps> = ({
  notices,
  onSelect,
  onDismiss,
}) => {
  if (notices.length === 0) return null

  return (
    <div className="px-3 pb-2">
      <SectionHeader
        label="Idle terminals"
        count={notices.length}
        className="mb-1"
      />
      <div className="space-y-0.5">
        {notices.map((notice) => (
          <Tooltip
            key={notice.id}
            side="right"
            label={notice.sessionName}
            detail={`${notice.processName} finished - ${notice.projectName}`}
          >
            <ListRow
              density="compact"
              render={<button type="button" />}
              onClick={() => void onSelect(notice)}
              aria-label={`${notice.sessionName}, terminal idle after ${notice.processName}, ${notice.projectName}`}
              leading={<TerminalSquare aria-hidden className="size-3" />}
              title={notice.sessionName}
              aside={notice.projectName}
              trailing={
                <span className="max-w-20 truncate">{notice.processName}</span>
              }
              actions={
                <IconButton
                  label={`Dismiss idle terminal ${notice.sessionName}`}
                  tooltipSide="left"
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDismiss(notice.terminalId)
                  }}
                >
                  <Check className="h-2.5 w-2.5" />
                </IconButton>
              }
            />
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
