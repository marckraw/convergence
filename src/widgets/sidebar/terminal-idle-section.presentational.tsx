import type { FC } from 'react'
import { Check, TerminalSquare } from 'lucide-react'
import type { TerminalIdleNotice } from '@/entities/terminal'
import { Button } from '@/shared/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

interface TerminalIdleSectionProps {
  notices: TerminalIdleNotice[]
  onSelect: (notice: TerminalIdleNotice) => void | Promise<void>
  onDismiss: (terminalId: string) => void
}

export const TerminalIdleSection: FC<TerminalIdleSectionProps> = ({
  notices,
  onSelect,
  onDismiss,
}) => {
  if (notices.length === 0) return null

  return (
    <div className="px-3 pb-2">
      <p className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
        <span className="truncate">Terminals Idle</span>
        <span className="shrink-0 text-muted-foreground/60">
          {notices.length}
        </span>
      </p>
      <div className="space-y-0.5">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className="group flex min-w-0 items-center gap-1 rounded-md transition-colors hover:bg-accent"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void onSelect(notice)}
                  aria-label={`${notice.sessionName}, terminal idle after ${notice.processName}, ${notice.projectName}`}
                  className="h-auto min-w-0 flex-1 items-center justify-start gap-1.5 px-1.5 py-0.5 text-left text-xs leading-tight"
                >
                  <TerminalSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                    <span className="min-w-0 shrink truncate font-medium">
                      {notice.sessionName}
                    </span>
                    <span className="min-w-0 shrink truncate text-[10px] leading-tight text-muted-foreground/60">
                      {notice.projectName}
                    </span>
                  </span>
                  <span className="max-w-[5rem] shrink truncate text-muted-foreground">
                    {notice.processName}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{notice.sessionName}</p>
                <p className="text-[11px] opacity-70">
                  {notice.processName} finished - {notice.projectName}
                </p>
              </TooltipContent>
            </Tooltip>

            <div className="mr-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Dismiss idle terminal ${notice.sessionName}`}
                    className="h-5 w-5 shrink-0"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDismiss(notice.terminalId)
                    }}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>Acknowledge</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
