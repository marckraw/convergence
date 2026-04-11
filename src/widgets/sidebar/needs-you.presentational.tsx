import type { FC } from 'react'
import type { Session } from '@/entities/session'
import { AlertTriangle, MessageSquare } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'

interface NeedsYouProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelect: (id: string) => void
}

export const NeedsYou: FC<NeedsYouProps> = ({
  sessions,
  activeSessionId,
  onSelect,
}) => {
  if (sessions.length === 0) return null

  return (
    <div className="px-3 pb-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Needs You ({sessions.length})
      </p>
      <div className="space-y-1">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSelect(session.id)}
            className={cn(
              'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
              activeSessionId === session.id && 'bg-accent',
            )}
          >
            {session.attention === 'needs-approval' ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            ) : (
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{session.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {session.attention === 'needs-approval'
                  ? 'Approval needed'
                  : 'Input needed'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
