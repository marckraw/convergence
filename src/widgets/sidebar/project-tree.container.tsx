import { useState } from 'react'
import type { FC } from 'react'
import type { Workspace } from '@/entities/workspace'
import type { WorkspacePullRequest } from '@/entities/pull-request'
import type { SessionSummary } from '@/entities/session'
import { SessionCreateInline } from '@/features/session-create-inline'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Input } from '@/shared/ui/input'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { cn } from '@/shared/lib/cn.pure'
import {
  Archive,
  ChevronRight,
  GitBranch,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  TerminalSquare,
  Trash2,
  Undo2,
} from 'lucide-react'

interface ProjectTreeProps {
  baseBranchName: string | null
  workspaces: Workspace[]
  sessions: SessionSummary[]
  activeSessionId: string | null
  pullRequestsByWorkspaceId?: Readonly<Record<string, WorkspacePullRequest>>
  regeneratingSessionIds?: ReadonlySet<string>
  pulsingSessionIds?: Readonly<Record<string, true>>
  onSelectSession: (id: string) => void
  onArchiveSession: (id: string) => void
  onUnarchiveSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onRenameSession: (id: string, name: string) => void
  onRegenerateSessionName: (id: string) => void
  onArchiveWorkspace?: (workspaceId: string) => void
  onUnarchiveWorkspace?: (workspaceId: string) => void
  onRemoveWorkspaceWorktree?: (workspaceId: string) => void
  onDeleteWorkspace: (workspaceId: string) => void
  onOpenCreateWorkspace: () => void
}

export const ProjectTree: FC<ProjectTreeProps> = ({
  baseBranchName,
  workspaces,
  sessions,
  activeSessionId,
  pullRequestsByWorkspaceId,
  regeneratingSessionIds,
  pulsingSessionIds,
  onSelectSession,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
  onRenameSession,
  onRegenerateSessionName,
  onArchiveWorkspace,
  onUnarchiveWorkspace,
  onRemoveWorkspaceWorktree,
  onDeleteWorkspace,
  onOpenCreateWorkspace,
}) => {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
    new Set(),
  )
  const [showArchived, setShowArchived] = useState(false)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  )
  const [renameDraft, setRenameDraft] = useState('')

  const submitRename = () => {
    if (!renamingSessionId) return
    const next = renameDraft.trim()
    if (next.length > 0) {
      onRenameSession(renamingSessionId, next)
    }
    setRenamingSessionId(null)
    setRenameDraft('')
  }

  const cancelRename = () => {
    setRenamingSessionId(null)
    setRenameDraft('')
  }

  const toggleWorkspace = (id: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const activeWorkspaces = workspaces.filter(
    (workspace) => !workspace.archivedAt,
  )
  const archivedWorkspaces = workspaces.filter(
    (workspace) => workspace.archivedAt,
  )
  const archivedRootSessions = sessions.filter(
    (session) => session.archivedAt && !session.workspaceId,
  )
  const activeArchivedSession = sessions.some(
    (session) => session.id === activeSessionId && !!session.archivedAt,
  )
  const rootSessions = sessions.filter((s) => !s.workspaceId && !s.archivedAt)
  const getActiveWorkspaceSessions = (wsId: string) =>
    sessions.filter((s) => s.workspaceId === wsId && !s.archivedAt)
  const getWorkspaceSessions = (wsId: string) =>
    sessions.filter((s) => s.workspaceId === wsId)

  const renderSessionActions = (session: SessionSummary) => {
    const isArchived = !!session.archivedAt
    const isRegeneratingName = regeneratingSessionIds?.has(session.id) ?? false
    const canRegenerateName = session.providerId !== 'shell'

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/session:opacity-100 focus-visible:opacity-100"
            aria-label={`Session actions ${session.name}`}
            title="Session actions"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="gap-2"
            onClick={() => {
              setRenamingSessionId(session.id)
              setRenameDraft(session.name)
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Rename</span>
          </DropdownMenuItem>
          {canRegenerateName ? (
            <>
              <DropdownMenuItem
                className="gap-2"
                disabled={isRegeneratingName}
                onClick={() => onRegenerateSessionName(session.id)}
              >
                {isRegeneratingName ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>
                  {isRegeneratingName
                    ? 'Regenerating name…'
                    : 'Regenerate name'}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {isArchived ? (
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onClick={() => onDeleteSession(session.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete session</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const renderWorkspaceActions = (workspace: Workspace) => {
    const isArchived = !!workspace.archivedAt

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/workspace:opacity-100 focus-visible:opacity-100"
            aria-label={`Workspace actions ${workspace.branchName}`}
            title="Workspace actions"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isArchived ? (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => onUnarchiveWorkspace?.(workspace.id)}
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span>Unarchive workspace</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => onArchiveWorkspace?.(workspace.id)}
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Archive workspace...</span>
            </DropdownMenuItem>
          )}
          {!workspace.worktreeRemovedAt ? (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => onRemoveWorkspaceWorktree?.(workspace.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove worktree from disk...</span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onClick={() => onDeleteWorkspace(workspace.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete permanently...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const renderSessionRow = (session: SessionSummary) => {
    const isRenaming = renamingSessionId === session.id
    const isRegeneratingName = regeneratingSessionIds?.has(session.id) ?? false
    const pulsing = pulsingSessionIds?.[session.id] === true

    return (
      <div
        key={session.id}
        data-pulse={pulsing ? 'true' : undefined}
        className={cn(
          'group/session flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent',
          activeSessionId === session.id && 'bg-accent',
        )}
      >
        {isRenaming ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1"
            onSubmit={(event) => {
              event.preventDefault()
              submitRename()
            }}
          >
            {session.providerId === 'shell' ? (
              <TerminalSquare
                className="h-3 w-3 shrink-0 text-muted-foreground"
                aria-label="Terminal session"
              />
            ) : (
              <SessionBadge attention={session.attention} />
            )}
            <Input
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onBlur={submitRename}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelRename()
                }
              }}
              className="h-6 flex-1 min-w-0 text-xs"
              autoFocus
              aria-label={`Rename ${session.name}`}
            />
          </form>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSelectSession(session.id)}
                onDoubleClick={() => {
                  setRenamingSessionId(session.id)
                  setRenameDraft(session.name)
                }}
                className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-1.5 py-1 text-left text-xs font-normal"
              >
                {session.providerId === 'shell' ? (
                  <TerminalSquare
                    className="h-3 w-3 shrink-0 text-muted-foreground"
                    aria-label="Terminal session"
                  />
                ) : (
                  <SessionBadge attention={session.attention} />
                )}
                <span className="truncate">{session.name}</span>
                {isRegeneratingName && (
                  <Loader2
                    className="ml-auto h-3 w-3 shrink-0 animate-spin text-muted-foreground"
                    aria-label="Regenerating name"
                  />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isRegeneratingName
                ? `${session.name} (regenerating name…)`
                : session.name}
            </TooltipContent>
          </Tooltip>
        )}
        {renderSessionActions(session)}
      </div>
    )
  }

  return (
    <div className="px-3">
      {/* Root sessions (on main branch) */}
      <div className="mb-1 ml-2 border-l border-border pl-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="mb-0.5 truncate text-xs text-muted-foreground">
              {(baseBranchName || 'main') +
                (rootSessions.length > 0 ? ` (${rootSessions.length})` : '')}
            </p>
          </TooltipTrigger>
          <TooltipContent side="right">
            {baseBranchName || 'main'}
          </TooltipContent>
        </Tooltip>
        {rootSessions.map(renderSessionRow)}
        <div className="mt-1">
          <SessionCreateInline workspaceId={null} />
        </div>
      </div>

      {/* Active workspaces */}
      {activeWorkspaces.map((ws) => {
        const wsSessions = getActiveWorkspaceSessions(ws.id)
        const isExpanded = expandedWorkspaces.has(ws.id)
        const pullRequest = pullRequestsByWorkspaceId?.[ws.id] ?? null
        const isMerged = pullRequest?.state === 'merged'

        return (
          <div key={ws.id} className="ml-2 border-l border-border pl-2">
            <div className="group/workspace flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => toggleWorkspace(ws.id)}
                    className="h-auto min-w-0 flex-1 justify-start gap-1 py-1 text-left text-sm font-normal hover:text-foreground"
                  >
                    <ChevronRight
                      className={cn(
                        'h-3 w-3 shrink-0 transition-transform',
                        isExpanded && 'rotate-90',
                      )}
                    />
                    <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{ws.branchName}</span>
                    {isMerged ? (
                      <span className="shrink-0 rounded-full border border-teal-500/25 bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-200">
                        Merged
                      </span>
                    ) : null}
                    {wsSessions.length > 0 && (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {wsSessions.length}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{ws.branchName}</TooltipContent>
              </Tooltip>
              {renderWorkspaceActions(ws)}
            </div>

            {isExpanded && (
              <div className="ml-4 space-y-0.5">
                {wsSessions.map(renderSessionRow)}
                <div className="mt-1">
                  <SessionCreateInline workspaceId={ws.id} />
                </div>
              </div>
            )}
          </div>
        )
      })}

      {archivedWorkspaces.length > 0 || archivedRootSessions.length > 0 ? (
        <div className="mt-3 ml-2 border-l border-border pl-2">
          <div className="group/workspace flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowArchived((current) => !current)}
                  className="h-auto min-w-0 flex-1 justify-start gap-1 py-1 text-left text-sm font-normal hover:text-foreground"
                >
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 shrink-0 transition-transform',
                      (showArchived || activeArchivedSession) && 'rotate-90',
                    )}
                  />
                  <Archive className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">Archived</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {archivedWorkspaces.length + archivedRootSessions.length}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Archived workspaces and sessions
              </TooltipContent>
            </Tooltip>
          </div>

          {(showArchived || activeArchivedSession) && (
            <div className="ml-4 space-y-0.5">
              {archivedWorkspaces.map((ws) => {
                const wsSessions = getWorkspaceSessions(ws.id)
                const isExpanded = expandedWorkspaces.has(ws.id)
                const pullRequest = pullRequestsByWorkspaceId?.[ws.id] ?? null
                const isMerged = pullRequest?.state === 'merged'

                return (
                  <div key={ws.id}>
                    <div className="group/workspace flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => toggleWorkspace(ws.id)}
                            className="h-auto min-w-0 flex-1 justify-start gap-1 py-1 text-left text-sm font-normal hover:text-foreground"
                          >
                            <ChevronRight
                              className={cn(
                                'h-3 w-3 shrink-0 transition-transform',
                                isExpanded && 'rotate-90',
                              )}
                            />
                            <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate">{ws.branchName}</span>
                            {isMerged ? (
                              <span className="shrink-0 rounded-full border border-teal-500/25 bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-200">
                                Merged
                              </span>
                            ) : null}
                            {ws.worktreeRemovedAt ? (
                              <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                Worktree removed
                              </span>
                            ) : null}
                            {wsSessions.length > 0 && (
                              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                {wsSessions.length}
                              </span>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {ws.branchName}
                        </TooltipContent>
                      </Tooltip>
                      {renderWorkspaceActions(ws)}
                    </div>

                    {isExpanded && (
                      <div className="ml-4 space-y-0.5">
                        {wsSessions.map(renderSessionRow)}
                      </div>
                    )}
                  </div>
                )
              })}
              {archivedRootSessions.map(renderSessionRow)}
            </div>
          )}
        </div>
      ) : null}

      {/* New workspace */}
      <div className="mt-2 ml-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onOpenCreateWorkspace}
          className="h-auto items-center gap-1 px-0 py-0 text-xs font-normal text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          New workspace
        </Button>
      </div>
    </div>
  )
}
