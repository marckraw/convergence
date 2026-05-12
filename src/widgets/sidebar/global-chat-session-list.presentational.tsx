import type { FC } from 'react'
import type { SessionSummary } from '@/entities/session'
import type { SpaceAttemptRole } from '@/entities/space'
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
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Link2,
  MessageSquarePlus,
  MoreHorizontal,
  Trash2,
  Unlink,
  Undo2,
} from 'lucide-react'

export interface ChatSidebarSpaceAttempt {
  attemptId: string
  sessionId: string
  sessionName: string
  role: SpaceAttemptRole
  session: SessionSummary | null
}

export interface ChatSidebarSpace {
  id: string
  title: string
  archivedAt: string | null
  attempts: ChatSidebarSpaceAttempt[]
}

interface GlobalChatSessionListProps {
  spaces: ChatSidebarSpace[]
  sessions: SessionSummary[]
  activeSessionId: string | null
  selectedSpaceId: string | null
  expandedSpaceIds: ReadonlySet<string>
  archivedSpacesExpanded: boolean
  onNewSession: () => void
  onNewSpace: () => void
  onSelectSpace: (id: string) => void
  onToggleSpace: (id: string) => void
  onToggleArchivedSpaces: () => void
  onArchiveSpace: (id: string) => void
  onUnarchiveSpace: (id: string) => void
  onSelectSpaceAttempt: (sessionId: string) => void
  onSelectSession: (id: string) => void
  onManageSessionSpaces: (id: string) => void
  onDetachSpaceAttempt: (
    attemptId: string,
    spaceId: string,
    sessionId: string,
  ) => void
  onArchiveSession: (id: string) => void
  onUnarchiveSession: (id: string) => void
  onDeleteSession: (id: string) => void
}

export const GlobalChatSessionList: FC<GlobalChatSessionListProps> = ({
  spaces,
  sessions,
  activeSessionId,
  selectedSpaceId,
  expandedSpaceIds,
  archivedSpacesExpanded,
  onNewSession,
  onNewSpace,
  onSelectSpace,
  onToggleSpace,
  onToggleArchivedSpaces,
  onArchiveSpace,
  onUnarchiveSpace,
  onSelectSpaceAttempt,
  onSelectSession,
  onManageSessionSpaces,
  onDetachSpaceAttempt,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
}) => {
  const activeSessions = sessions.filter((session) => !session.archivedAt)
  const archivedSessions = sessions.filter((session) => session.archivedAt)
  const activeSpaces = spaces.filter((space) => !space.archivedAt)
  const archivedSpaces = spaces.filter((space) => space.archivedAt)
  const activeArchivedSpace = archivedSpaces.some(
    (space) => space.id === selectedSpaceId,
  )
  const showArchivedSpaces = archivedSpacesExpanded || activeArchivedSpace

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
          {!session.archivedAt ? (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => onManageSessionSpaces(session.id)}
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>Add to Space...</span>
            </DropdownMenuItem>
          ) : null}
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
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onClick={() => onDeleteSession(session.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete session</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  return (
    <div className="px-3">
      <div className="mb-3 space-y-2">
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNewSpace}
          className="w-full justify-start gap-2"
        >
          <FolderPlus className="h-4 w-4" />
          New Space
        </Button>
      </div>

      <div className="mb-3 ml-2 border-l border-border pl-2">
        <p className="mb-0.5 truncate text-xs text-muted-foreground">
          Spaces{activeSpaces.length > 0 ? ` (${activeSpaces.length})` : ''}
        </p>
        {activeSpaces.length > 0 ? (
          <div className="space-y-0.5">
            {activeSpaces.map((space) => {
              const expanded = expandedSpaceIds.has(space.id)
              return (
                <div key={space.id}>
                  <div
                    className={cn(
                      'group/space flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent',
                      selectedSpaceId === space.id && 'bg-accent',
                    )}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} Space ${space.title}`}
                      onClick={() => onToggleSpace(space.id)}
                    >
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </Button>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onSelectSpace(space.id)}
                          aria-label={`Open Space ${space.title}`}
                          className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-1.5 py-1 text-left text-xs font-normal"
                        >
                          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{space.title}</span>
                          {space.attempts.length > 0 ? (
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              {space.attempts.length}
                            </span>
                          ) : null}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {space.title}
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/space:opacity-100 focus-visible:opacity-100"
                          aria-label={`Space actions ${space.title}`}
                          title="Space actions"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => onArchiveSpace(space.id)}
                        >
                          <Archive className="h-3.5 w-3.5" />
                          <span>Archive Space...</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {expanded ? (
                    <div className="ml-6 mt-0.5 space-y-0.5">
                      {space.attempts.length > 0 ? (
                        space.attempts.map((attempt) => (
                          <div
                            key={attempt.attemptId}
                            className={cn(
                              'group/attempt flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent',
                              activeSessionId === attempt.sessionId &&
                                'bg-accent',
                            )}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() =>
                                    onSelectSpaceAttempt(attempt.sessionId)
                                  }
                                  aria-label={`Open Space attempt ${attempt.sessionName}`}
                                  className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-1.5 py-1 text-left text-xs font-normal"
                                >
                                  <SessionBadge
                                    attention={
                                      attempt.session?.attention ?? 'none'
                                    }
                                  />
                                  <span className="truncate">
                                    {attempt.sessionName}
                                  </span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                {attempt.sessionName}
                              </TooltipContent>
                            </Tooltip>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/attempt:opacity-100 focus-visible:opacity-100"
                                  aria-label={`Space attempt actions ${attempt.sessionName}`}
                                  title="Attempt actions"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() =>
                                    onManageSessionSpaces(attempt.sessionId)
                                  }
                                >
                                  <Link2 className="h-3.5 w-3.5" />
                                  <span>Manage Spaces...</span>
                                </DropdownMenuItem>
                                {attempt.session ? (
                                  attempt.session.archivedAt ? (
                                    <DropdownMenuItem
                                      className="gap-2"
                                      onClick={() =>
                                        onUnarchiveSession(attempt.sessionId)
                                      }
                                    >
                                      <Undo2 className="h-3.5 w-3.5" />
                                      <span>Unarchive session</span>
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      className="gap-2"
                                      onClick={() =>
                                        onArchiveSession(attempt.sessionId)
                                      }
                                    >
                                      <Archive className="h-3.5 w-3.5" />
                                      <span>Archive session</span>
                                    </DropdownMenuItem>
                                  )
                                ) : null}
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() =>
                                    onDetachSpaceAttempt(
                                      attempt.attemptId,
                                      space.id,
                                      attempt.sessionId,
                                    )
                                  }
                                >
                                  <Unlink className="h-3.5 w-3.5" />
                                  <span>Detach from Space</span>
                                </DropdownMenuItem>
                                {attempt.session ? (
                                  <DropdownMenuItem
                                    className="gap-2 text-destructive focus:text-destructive"
                                    onClick={() =>
                                      onDeleteSession(attempt.sessionId)
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>Delete session</span>
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ))
                      ) : (
                        <p className="px-1.5 py-1 text-xs text-muted-foreground">
                          No attempts yet
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="px-1.5 py-1 text-xs text-muted-foreground">
            No Spaces yet
          </p>
        )}
      </div>

      {archivedSpaces.length > 0 ? (
        <div className="mb-3 ml-2 border-l border-border pl-2">
          <div className="group/space flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label={`${showArchivedSpaces ? 'Collapse' : 'Expand'} archived Spaces`}
              onClick={onToggleArchivedSpaces}
            >
              {showArchivedSpaces ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onToggleArchivedSpaces}
              className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-1.5 py-1 text-left text-xs font-normal"
            >
              <Archive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">Archived Spaces</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {archivedSpaces.length}
              </span>
            </Button>
          </div>

          {showArchivedSpaces ? (
            <div className="ml-6 mt-0.5 space-y-0.5">
              {archivedSpaces.map((space) => (
                <div
                  key={space.id}
                  className={cn(
                    'group/space flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent',
                    selectedSpaceId === space.id && 'bg-accent',
                  )}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onSelectSpace(space.id)}
                        aria-label={`Open archived Space ${space.title}`}
                        className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-1.5 py-1 text-left text-xs font-normal"
                      >
                        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{space.title}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{space.title}</TooltipContent>
                  </Tooltip>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/space:opacity-100 focus-visible:opacity-100"
                        aria-label={`Archived Space actions ${space.title}`}
                        title="Space actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => onUnarchiveSpace(space.id)}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        <span>Unarchive Space</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-1 ml-2 border-l border-border pl-2">
        <p className="mb-0.5 truncate text-xs text-muted-foreground">
          Ungrouped chats
          {activeSessions.length > 0 ? ` (${activeSessions.length})` : ''}
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
