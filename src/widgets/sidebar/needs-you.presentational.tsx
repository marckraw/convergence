import type { FC } from 'react'
import type { Session, NeedsYouDisposition } from '@/entities/session'
import { BellOff, Check } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

interface NeedsYouSession {
  session: Session
  projectName: string
  summary: string
  priority: number
}

interface NeedsYouProps {
  sessions: NeedsYouSession[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onDismiss: (id: string) => void | Promise<void>
}

export const NeedsYou: FC<NeedsYouProps> = ({
  sessions,
  activeSessionId,
  onSelect,
  onDismiss,
}) => {
  if (sessions.length === 0) return null

  return (
    <div className="px-3 pb-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Needs You ({sessions.length})
      </p>
      <div className="space-y-1">
        {sessions.map(({ session, projectName, summary }) => {
          const action = getNeedsYouAction(session)

          return (
            <div
              key={session.id}
              className={cn(
                'group flex min-w-0 items-start gap-1 rounded-md transition-colors hover:bg-accent',
                activeSessionId === session.id && 'bg-accent',
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onSelect(session.id)}
                    className="h-auto min-w-0 flex-1 items-start justify-start gap-2 px-2 py-1 text-left text-sm leading-tight [&_svg]:size-3.5"
                  >
                    <span className="mt-0.25">
                      <SessionBadge attention={session.attention} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{session.name}</p>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground/85">
                        <span className="shrink-0">{summary}</span>
                        <span className="shrink-0 text-muted-foreground/45">
                          •
                        </span>
                        <span className="truncate text-muted-foreground/70">
                          {projectName}
                        </span>
                      </div>
                    </div>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{session.name}</p>
                  <p className="text-[11px] opacity-70">{projectName}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${action.label} ${session.name}`}
                    className="mt-0.5 mr-1 h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      void onDismiss(session.id)
                    }}
                  >
                    {action.disposition === 'snoozed' ? (
                      <BellOff className="h-2.5 w-2.5" />
                    ) : (
                      <Check className="h-2.5 w-2.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>{action.label}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function getNeedsYouAction(session: Session): {
  label: string
  disposition: NeedsYouDisposition
} {
  switch (session.attention) {
    case 'needs-approval':
    case 'needs-input':
      return { label: 'Snooze', disposition: 'snoozed' }
    case 'failed':
    case 'finished':
      return { label: 'Acknowledge', disposition: 'acknowledged' }
    default:
      return { label: 'Dismiss', disposition: 'snoozed' }
  }
}

export function buildNeedsYouSummary(session: Session): {
  summary: string
  priority: number
} | null {
  switch (session.attention) {
    case 'needs-approval':
      return { summary: 'Approval needed', priority: 0 }
    case 'needs-input':
      return { summary: 'Input needed', priority: 1 }
    case 'failed':
      return { summary: 'Session failed', priority: 2 }
    case 'finished':
      return { summary: 'Finished', priority: 3 }
    default:
      return null
  }
}
