import type { FC, ReactNode } from 'react'
import type { Session } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { Square, Trash2 } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { AttentionBadge } from './attention-badge.presentational'
import { TranscriptPreview } from './transcript-preview.presentational'

interface SessionListShellProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onApprove: (id: string) => void
  onDeny: (id: string) => void
  onStop: (id: string) => void
  onDelete: (id: string) => void
  startForm: ReactNode
}

export const SessionListShell: FC<SessionListShellProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onApprove,
  onDeny,
  onStop,
  onDelete,
  startForm,
}) => (
  <div className="w-full max-w-2xl">
    <h2 className="mb-3 text-sm font-semibold">Sessions</h2>

    {sessions.length > 0 && (
      <div className="mb-4 space-y-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={cn(
              'cursor-pointer rounded-md border p-3 transition-colors hover:bg-muted/50',
              activeSessionId === session.id && 'border-primary bg-muted/30',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{session.name}</span>
                <AttentionBadge attention={session.attention} />
              </div>
              <div className="flex items-center gap-1">
                {session.status === 'running' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      onStop(session.id)
                    }}
                    className="h-7 w-7"
                  >
                    <Square className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(session.id)
                  }}
                  className="h-7 w-7 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {session.attention === 'needs-approval' && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    onApprove(session.id)
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeny(session.id)
                  }}
                >
                  Deny
                </Button>
              </div>
            )}

            {activeSessionId === session.id &&
              session.transcript.length > 0 && (
                <div className="mt-3 space-y-1 border-t pt-2">
                  {session.transcript.slice(-5).map((entry, i) => (
                    <TranscriptPreview key={i} entry={entry} />
                  ))}
                </div>
              )}
          </div>
        ))}
      </div>
    )}

    {startForm}
  </div>
)
