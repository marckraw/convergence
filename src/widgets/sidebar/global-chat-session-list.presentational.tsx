import type { FC } from 'react'
import type { SessionSummary } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { cn } from '@/shared/lib/cn.pure'
import { Archive, MessageSquarePlus, MoreHorizontal, Undo2 } from 'lucide-react'

interface GlobalChatSessionListProps {
  sessions: SessionSummary[]
  activeSessionId: string | null
  onNewSession: () => void
  onSelectSession: (id: string) => void
  onArchiveSession: (id: string) => void
  onUnarchiveSession: (id: string) => void
}

export const GlobalChatSessionList: FC<GlobalChatSessionListProps> = ({
  sessions,
  activeSessionId,
  onNewSession,
  onSelectSession,
  onArchiveSession,
  onUnarchiveSession,
}) => {
  const activeSessions = sessions.filter((session) => !session.archivedAt)
  const archivedSessions = sessions.filter((session) => session.archivedAt)

  const renderSessionRow = (session: SessionSummary) => (
    <div
      key={session.id}
      className={cn(
        'group/session flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent',
        activeSessionId === session.id && 'bg-accent',
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onSelectSession(session.id)}
            aria-label={`Open chat session ${session.name}`}
            className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-1.5 py-1 text-left text-xs font-normal"
          >
            <SessionBadge attention={session.attention} />
            <span className="truncate">{session.name}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{session.name}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/session:opacity-100 focus-visible:opacity-100"
            aria-label={`Chat session actions ${session.name}`}
            title="Session actions"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {session.archivedAt ? (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => onUnarchiveSession(session.id)}
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span>Unarchive session</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => onArchiveSession(session.id)}
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Archive session</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  return (
    <div className="px-3">
      <div className="mb-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNewSession}
          className="w-full justify-start gap-2"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      <div className="mb-1 ml-2 border-l border-border pl-2">
        <p className="mb-0.5 truncate text-xs text-muted-foreground">
          Chats{activeSessions.length > 0 ? ` (${activeSessions.length})` : ''}
        </p>
        {activeSessions.length > 0 ? (
          activeSessions.map(renderSessionRow)
        ) : (
          <p className="px-1.5 py-1 text-xs text-muted-foreground">
            No chats yet
          </p>
        )}
      </div>

      {archivedSessions.length > 0 ? (
        <div className="mt-3 ml-2 border-l border-border pl-2">
          <div className="flex items-center gap-1 px-1.5 py-1 text-sm text-muted-foreground">
            <Archive className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">Archived</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {archivedSessions.length}
            </span>
          </div>
          <div className="ml-4 space-y-0.5">
            {archivedSessions.map(renderSessionRow)}
          </div>
        </div>
      ) : null}
    </div>
  )
}
