import type { FC } from 'react'
import type { Session } from '@/entities/session'
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  MessageSquare,
  X,
} from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
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
  onDismiss: (id: string) => void
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
        {sessions.map(({ session, projectName, summary }) => (
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
                  className="h-auto min-w-0 flex-1 items-start justify-start gap-2 px-2 py-1.5 text-left text-sm"
                >
                  {session.attention === 'needs-approval' ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  ) : session.attention === 'needs-input' ? (
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                  ) : session.attention === 'failed' ? (
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{session.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {summary}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground/80">
                      {projectName}
                    </p>
                  </div>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{session.name}</p>
                <p className="text-[11px] opacity-70">{projectName}</p>
              </TooltipContent>
            </Tooltip>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Dismiss ${session.name}`}
              className="mt-1 mr-1 h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              onClick={(event) => {
                event.stopPropagation()
                onDismiss(session.id)
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
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
