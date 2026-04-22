import type { FC } from 'react'
import { Archive, BellOff, Check } from 'lucide-react'
import type { Session, NeedsYouDisposition } from '@/entities/session'
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

interface NeedsYouSectionProps {
  title: string
  sessions: NeedsYouSession[]
  activeSessionId: string | null
  pulsingSessionIds?: Readonly<Record<string, true>>
  onSelect: (id: string) => void
  onDismiss: (id: string) => void | Promise<void>
  onArchive: (id: string) => void | Promise<void>
}

export const NeedsYouSection: FC<NeedsYouSectionProps> = ({
  title,
  sessions,
  activeSessionId,
  pulsingSessionIds,
  onSelect,
  onDismiss,
  onArchive,
}) => (
  <div>
    <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
      {title}
    </p>
    <div className="space-y-1">
      {sessions.map(({ session, projectName, summary }) => {
        const action = resolveNeedsYouAction(session)
        const showArchive = action.disposition === 'acknowledged'

        const pulsing = pulsingSessionIds?.[session.id] === true

        return (
          <div
            key={session.id}
            data-pulse={pulsing ? 'true' : undefined}
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

            <div className="mt-0.5 mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${action.label} ${session.name}`}
                    className="h-6 w-6 shrink-0"
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

              {showArchive && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Archive ${session.name}`}
                      className="h-6 w-6 shrink-0"
                      onClick={(event) => {
                        event.stopPropagation()
                        void onArchive(session.id)
                      }}
                    >
                      <Archive className="h-2.5 w-2.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>Archive</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        )
      })}
    </div>
  </div>
)

function resolveNeedsYouAction(session: Session): {
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
