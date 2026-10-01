import { SessionStateBadge } from '@/entities/session'
import { parallelWorkStatus } from '@/shared/lib/parallel-work.pure'
import {
  noConversationMatchesLine,
  normalizeNameQuery,
} from '@/shared/lib/name-search.pure'
import { isRemoteExecutionHost } from '@/entities/execution-host'
import { memo, useEffect, useState } from 'react'
import type { Workspace } from '@/entities/workspace'
import type { WorkspacePullRequest } from '@/entities/pull-request'
import type { SessionSummary } from '@/entities/session'
import { SessionCreateInline } from '@/features/session-create-inline'
import {
  SessionActivityCard,
  needsYouCardModel,
  type CardContext,
} from '@/features/needs-you'
import {
  Button,
  cn,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  IconButton,
  Input,
  Tooltip,
} from '@convergence/ui'
import {
  Archive,
  ChevronRight,
  Cloud,
  GitBranch,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  TerminalSquare,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useFormSubmitShortcut } from '@/shared/lib/use-form-submit-shortcut.pure'

/** Shown on branch-row tooltips while search keeps every branch open. */
export const BRANCHES_STAY_OPEN_WHILE_YOU_SEARCH =
  'Branches stay open while you search'

interface ProjectTreeProps {
  cardContext: CardContext
  baseBranchName: string | null
  workspaces: readonly Workspace[]
  sessions: readonly SessionSummary[]
  activeSessionId: string | null
  nameSearchQuery?: string
  pullRequestsByWorkspaceId?: Readonly<Record<string, WorkspacePullRequest>>
  regeneratingSessionIds?: ReadonlySet<string>
  pulsingSessionIds?: Readonly<Record<string, true>>
  expandedWorkspaces?: ReadonlySet<string>
  onToggleWorkspace?: (id: string) => void
  onSelectSession: (id: string) => void
  onArchiveSession: (id: string) => void
  onUnarchiveSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onRenameSession: (id: string, name: string) => void
  onRegenerateSessionName: (id: string) => void
  onArchiveWorkspace?: (workspaceId: string) => void
  onUnarchiveWorkspace?: (workspaceId: string) => void
  onRemoveWorkspaceWorktree?: (workspaceId: string) => void
  onSyncWorkspaceEnvFiles?: (workspaceId: string) => void
  onDeleteWorkspace: (workspaceId: string) => void
  onOpenCreateWorkspace: () => void
}

export const ProjectTree = memo(function ProjectTree({
  cardContext,
  baseBranchName,
  workspaces,
  sessions,
  activeSessionId,
  nameSearchQuery = '',
  pullRequestsByWorkspaceId,
  regeneratingSessionIds,
  pulsingSessionIds,
  expandedWorkspaces,
  onToggleWorkspace,
  onSelectSession,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
  onRenameSession,
  onRegenerateSessionName,
  onArchiveWorkspace,
  onUnarchiveWorkspace,
  onRemoveWorkspaceWorktree,
  onSyncWorkspaceEnvFiles,
  onDeleteWorkspace,
  onOpenCreateWorkspace,
}: ProjectTreeProps) {
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(
    new Set(),
  )
  const effectiveExpanded = expandedWorkspaces ?? internalExpanded
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

  // Enable cmd+Enter to submit the rename form
  useFormSubmitShortcut(renamingSessionId !== null, submitRename)

  const cancelRename = () => {
    setRenamingSessionId(null)
    setRenameDraft('')
  }

  const toggleWorkspace = (id: string) => {
    if (onToggleWorkspace) {
      onToggleWorkspace(id)
      return
    }
    setInternalExpanded((prev) => {
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
  const activeArchivedSessionId = sessions.find(
    (session) => session.id === activeSessionId,
  )?.archivedAt
    ? activeSessionId
    : null
  const rootSessions = sessions.filter((s) => !s.workspaceId && !s.archivedAt)
  const searching = normalizeNameQuery(nameSearchQuery).length > 0
  const archivedExpanded = searching || showArchived
  const getActiveWorkspaceSessions = (wsId: string) =>
    sessions.filter((s) => s.workspaceId === wsId && !s.archivedAt)
  const getWorkspaceSessions = (wsId: string) =>
    sessions.filter((s) => s.workspaceId === wsId)

  useEffect(() => {
    if (activeArchivedSessionId) {
      setShowArchived(true)
    }
  }, [activeArchivedSessionId])

  const renderSessionActions = (session: SessionSummary, card = false) => {
    const isArchived = !!session.archivedAt
    const isRegeneratingName = regeneratingSessionIds?.has(session.id) ?? false
    const canRegenerateName = session.providerId !== 'shell'

    return (
      <Menu>
        <MenuTrigger
          render={
            <IconButton
              label={`Session actions ${session.name}`}
              tooltipSide="left"
              type="button"
              variant="ghost"
              size={card ? 'lg' : 'xs'}
              className={
                card
                  ? 'shrink-0 rounded-lg text-muted-foreground hover:text-foreground'
                  : 'shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/session:opacity-100 focus-visible:opacity-100'
              }
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </IconButton>
          }
        />
        <MenuContent align="end">
          <MenuItem
            onClick={() => {
              setRenamingSessionId(session.id)
              setRenameDraft(session.name)
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Rename</span>
          </MenuItem>
          {canRegenerateName ? (
            <>
              <MenuItem
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
              </MenuItem>
              <MenuSeparator />
            </>
          ) : null}
          {isArchived ? (
            <MenuItem onClick={() => onUnarchiveSession(session.id)}>
              <Undo2 className="h-3.5 w-3.5" />
              <span>Unarchive session</span>
            </MenuItem>
          ) : (
            <MenuItem onClick={() => onArchiveSession(session.id)}>
              <Archive className="h-3.5 w-3.5" />
              <span>Archive session</span>
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem
            variant="danger"
            onClick={() => onDeleteSession(session.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete session…</span>
          </MenuItem>
        </MenuContent>
      </Menu>
    )
  }

  const renderWorkspaceActions = (workspace: Workspace) => {
    const isArchived = !!workspace.archivedAt

    return (
      <Menu>
        <MenuTrigger
          render={
            <IconButton
              label={`Workspace actions ${workspace.branchName}`}
              type="button"
              variant="quiet"
              onClick={(event) => event.stopPropagation()}
              tooltipSide="left"
              size="xs"
              className="shrink-0 opacity-0 transition-opacity group-hover/workspace:opacity-100 focus-visible:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </IconButton>
          }
        />

        <MenuContent align="end">
          {isArchived ? (
            <MenuItem onClick={() => onUnarchiveWorkspace?.(workspace.id)}>
              <Undo2 className="h-3.5 w-3.5" />
              <span>Unarchive workspace</span>
            </MenuItem>
          ) : (
            <MenuItem onClick={() => onArchiveWorkspace?.(workspace.id)}>
              <Archive className="h-3.5 w-3.5" />
              <span>Archive workspace…</span>
            </MenuItem>
          )}
          {!workspace.worktreeRemovedAt ? (
            <>
              <MenuItem onClick={() => onSyncWorkspaceEnvFiles?.(workspace.id)}>
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Sync env files</span>
              </MenuItem>
              <MenuItem
                onClick={() => onRemoveWorkspaceWorktree?.(workspace.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove worktree from disk…</span>
              </MenuItem>
            </>
          ) : null}
          <MenuSeparator />
          <MenuItem
            variant="danger"
            onClick={() => onDeleteWorkspace(workspace.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete permanently…</span>
          </MenuItem>
        </MenuContent>
      </Menu>
    )
  }

  const renderSessionRow = (session: SessionSummary) => {
    const isRenaming = renamingSessionId === session.id
    const isRegeneratingName = regeneratingSessionIds?.has(session.id) ?? false
    const pulsing = pulsingSessionIds?.[session.id] === true

    if (session.providerId !== 'shell' && !isRenaming) {
      return (
        <div key={session.id} className="my-1.5 min-w-0">
          <SessionActivityCard
            card={needsYouCardModel(session, cardContext)}
            active={activeSessionId === session.id}
            compact={activeSessionId !== session.id}
            pulsing={pulsing}
            regeneratingName={isRegeneratingName}
            selectionLabel={session.name}
            onSelect={onSelectSession}
            onRename={() => {
              setRenamingSessionId(session.id)
              setRenameDraft(session.name)
            }}
            actions={renderSessionActions(session, true)}
          />
        </div>
      )
    }

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
              <SessionStateBadge session={session} />
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
          <Tooltip
            label={
              isRegeneratingName
                ? `${session.name} (regenerating name…)`
                : session.name
            }
            side="right"
          >
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSelectSession(session.id)}
              onDoubleClick={() => {
                setRenamingSessionId(session.id)
                setRenameDraft(session.name)
              }}
              size="lg"
              className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-1.5 py-1 text-left text-xs font-normal"
            >
              {session.providerId === 'shell' ? (
                <TerminalSquare
                  className="h-3 w-3 shrink-0 text-muted-foreground"
                  aria-label="Terminal session"
                />
              ) : (
                <SessionStateBadge session={session} />
              )}
              <span className="min-w-0 text-left">
                <span className="block truncate">{session.name}</span>
                {parallelWorkStatus(session) && (
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {parallelWorkStatus(session)}
                  </span>
                )}
              </span>
              {isRemoteExecutionHost(session.executionHost) && (
                <Cloud
                  className="h-3 w-3 shrink-0 text-sky-500/80"
                  aria-label="Runs on remote execution host"
                />
              )}
              {isRegeneratingName && (
                <Loader2
                  className="ml-auto h-3 w-3 shrink-0 animate-spin text-muted-foreground"
                  aria-label="Regenerating name"
                />
              )}
            </Button>
          </Tooltip>
        )}
        {renderSessionActions(session)}
      </div>
    )
  }

  return (
    <div className="px-3">
      {searching && sessions.length === 0 ? (
        <p
          role="status"
          className="mb-3 rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground"
        >
          {noConversationMatchesLine(nameSearchQuery.trim())}
        </p>
      ) : null}

      {/* Root sessions (on main branch) */}
      {!searching || rootSessions.length > 0 ? (
        <div className="mb-1 ml-2 border-l border-border pl-2">
          <Tooltip label={baseBranchName || 'main'} side="right">
            <p className="mb-0.5 truncate text-xs text-muted-foreground">
              {(baseBranchName || 'main') +
                (rootSessions.length > 0 ? ` (${rootSessions.length})` : '')}
            </p>
          </Tooltip>
          {rootSessions.map(renderSessionRow)}
          {!searching ? (
            <div className="mt-1">
              <SessionCreateInline workspaceId={null} />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Active workspaces */}
      {activeWorkspaces.map((ws) => {
        const wsSessions = getActiveWorkspaceSessions(ws.id)
        if (searching && wsSessions.length === 0) return null
        const isExpanded = searching || effectiveExpanded.has(ws.id)
        const pullRequest = pullRequestsByWorkspaceId?.[ws.id] ?? null
        const isMerged = pullRequest?.state === 'merged'

        return (
          <div key={ws.id} className="ml-2 border-l border-border pl-2">
            <div className="group/workspace flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent">
              <Tooltip
                side="right"
                label={ws.branchName}
                detail={
                  searching ? BRANCHES_STAY_OPEN_WHILE_YOU_SEARCH : undefined
                }
              >
                <Button
                  type="button"
                  variant="ghost"
                  disabled={searching}
                  onClick={() => {
                    if (!searching) toggleWorkspace(ws.id)
                  }}
                  size="lg"
                  className="h-auto min-w-0 flex-1 justify-start gap-1 py-1 text-left font-normal hover:text-foreground"
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
              </Tooltip>
              {renderWorkspaceActions(ws)}
            </div>

            {isExpanded && (
              <div className="ml-4 space-y-0.5">
                {wsSessions.map(renderSessionRow)}
                {!searching ? (
                  <div className="mt-1">
                    <SessionCreateInline workspaceId={ws.id} />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )
      })}

      {(!searching &&
        (archivedWorkspaces.length > 0 || archivedRootSessions.length > 0)) ||
      (searching &&
        (archivedWorkspaces.some(
          (ws) => getWorkspaceSessions(ws.id).length > 0,
        ) ||
          archivedRootSessions.length > 0)) ? (
        <div className="mt-3 ml-2 border-l border-border pl-2">
          <div className="group/workspace flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent">
            <Tooltip
              side="right"
              label="Archived workspaces and sessions"
              detail={
                searching ? BRANCHES_STAY_OPEN_WHILE_YOU_SEARCH : undefined
              }
            >
              <Button
                type="button"
                variant="ghost"
                aria-label={`${archivedExpanded ? 'Collapse' : 'Expand'} archived workspaces and sessions`}
                disabled={searching}
                onClick={() => {
                  if (!searching) setShowArchived((current) => !current)
                }}
                size="lg"
                className="h-auto min-w-0 flex-1 justify-start gap-1 py-1 text-left font-normal hover:text-foreground"
              >
                <ChevronRight
                  className={cn(
                    'h-3 w-3 shrink-0 transition-transform',
                    archivedExpanded && 'rotate-90',
                  )}
                />
                <Archive className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">Archived</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {searching
                    ? archivedWorkspaces.reduce(
                        (count, ws) =>
                          count + getWorkspaceSessions(ws.id).length,
                        0,
                      ) + archivedRootSessions.length
                    : archivedWorkspaces.length + archivedRootSessions.length}
                </span>
              </Button>
            </Tooltip>
          </div>

          {archivedExpanded && (
            <div className="ml-4 space-y-0.5">
              {archivedWorkspaces.map((ws) => {
                const wsSessions = getWorkspaceSessions(ws.id)
                if (searching && wsSessions.length === 0) return null
                const isExpanded = searching || effectiveExpanded.has(ws.id)
                const pullRequest = pullRequestsByWorkspaceId?.[ws.id] ?? null
                const isMerged = pullRequest?.state === 'merged'

                return (
                  <div key={ws.id}>
                    <div className="group/workspace flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent">
                      <Tooltip
                        side="right"
                        label={ws.branchName}
                        detail={
                          searching
                            ? BRANCHES_STAY_OPEN_WHILE_YOU_SEARCH
                            : undefined
                        }
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={searching}
                          onClick={() => {
                            if (!searching) toggleWorkspace(ws.id)
                          }}
                          size="lg"
                          className="h-auto min-w-0 flex-1 justify-start gap-1 py-1 text-left font-normal hover:text-foreground"
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
      {!searching ? (
        <div className="mt-2 ml-2">
          <Button
            type="button"
            variant="quiet"
            onClick={onOpenCreateWorkspace}
            size="lg"
            className="h-auto items-center gap-1 px-0 py-0 text-xs font-normal"
          >
            <Plus className="h-3 w-3" />
            New workspace
          </Button>
        </div>
      ) : null}
    </div>
  )
})
