import { SessionStateBadge } from '@/entities/session'
import {
  noConversationMatchesLine,
  normalizeNameQuery,
} from '@/shared/lib/name-search.pure'
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
  Badge,
  Button,
  EmptyState,
  MenuItem,
  MenuSeparator,
  Input,
  RowActions,
  SectionHeader,
  Spinner,
  Tooltip,
} from '@convergence/ui'
import {
  Archive,
  GitBranch,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  TerminalSquare,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useFormSubmitShortcut } from '@/shared/lib/use-form-submit-shortcut.pure'
import { TreeDisclosureRow } from './tree-disclosure-row.presentational'
import { TreeSessionRow } from './tree-session-row.presentational'

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
      // A row's ⋯ shows with its row (ListRow's actions); a card's always,
      // at sm, as the Needs-you card's (R3: 28 in a panel; NAV-6).
      <RowActions
        label={`Session actions ${session.name}`}
        size={card ? 'sm' : 'xs'}
      >
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
                <Spinner size="sm" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>
                {isRegeneratingName ? 'Regenerating name…' : 'Regenerate name'}
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
        <MenuItem variant="danger" onClick={() => onDeleteSession(session.id)}>
          <Trash2 className="h-3.5 w-3.5" />
          <span>Delete session…</span>
        </MenuItem>
      </RowActions>
    )
  }

  const renderWorkspaceActions = (workspace: Workspace) => {
    const isArchived = !!workspace.archivedAt

    return (
      <RowActions label={`Workspace actions ${workspace.branchName}`}>
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
            <MenuItem onClick={() => onRemoveWorkspaceWorktree?.(workspace.id)}>
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
      </RowActions>
    )
  }

  const renderSessionRow = (session: SessionSummary) => {
    const isRenaming = renamingSessionId === session.id
    const isRegeneratingName = regeneratingSessionIds?.has(session.id) ?? false
    const pulsing = pulsingSessionIds?.[session.id] === true
    const startRename = () => {
      setRenamingSessionId(session.id)
      setRenameDraft(session.name)
    }

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
            onRename={startRename}
            actions={renderSessionActions(session, true)}
          />
        </div>
      )
    }

    const leading =
      session.providerId === 'shell' ? (
        <TerminalSquare className="size-3" aria-label="Terminal session" />
      ) : (
        <SessionStateBadge session={session} />
      )

    if (isRenaming) {
      return (
        <div key={session.id} className="flex min-w-0 items-center gap-1 pr-1">
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1"
            onSubmit={(event) => {
              event.preventDefault()
              submitRename()
            }}
          >
            <span className="flex shrink-0 text-ink-muted">{leading}</span>
            <Input
              size="xs"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onBlur={submitRename}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelRename()
                }
              }}
              density="compact"
              className="flex-1 min-w-0"
              autoFocus
              aria-label={`Rename ${session.name}`}
            />
          </form>
          {renderSessionActions(session)}
        </div>
      )
    }

    return (
      <TreeSessionRow
        key={session.id}
        session={session}
        selected={activeSessionId === session.id}
        pulsing={pulsing}
        regeneratingName={isRegeneratingName}
        onSelect={() => onSelectSession(session.id)}
        onRename={startRename}
        actions={renderSessionActions(session)}
      />
    )
  }

  const searchLock = searching ? BRANCHES_STAY_OPEN_WHILE_YOU_SEARCH : undefined

  const renderWorkspaceRow = (
    ws: Workspace,
    wsSessions: readonly SessionSummary[],
    isExpanded: boolean,
  ) => {
    const pullRequest = pullRequestsByWorkspaceId?.[ws.id] ?? null
    const isMerged = pullRequest?.state === 'merged'
    return (
      <TreeDisclosureRow
        title={ws.branchName}
        icon={<GitBranch aria-hidden className="size-3 shrink-0" />}
        expanded={isExpanded}
        locked={searching}
        tooltipDetail={searchLock}
        marks={
          isMerged || ws.worktreeRemovedAt ? (
            <>
              {isMerged ? <Badge hue="merged">Merged</Badge> : null}
              {ws.worktreeRemovedAt ? <Badge>Worktree removed</Badge> : null}
            </>
          ) : undefined
        }
        count={wsSessions.length > 0 ? wsSessions.length : undefined}
        actions={renderWorkspaceActions(ws)}
        onToggle={() => toggleWorkspace(ws.id)}
      />
    )
  }

  return (
    <div className="px-3">
      {searching && sessions.length === 0 ? (
        <div role="status" className="mb-3">
          <EmptyState
            size="compact"
            title={noConversationMatchesLine(nameSearchQuery.trim())}
          />
        </div>
      ) : null}

      {/* Root sessions (on main branch) */}
      {!searching || rootSessions.length > 0 ? (
        <div className="mb-1 ml-2 border-l border-line pl-2">
          <Tooltip label={baseBranchName || 'main'} side="right">
            <SectionHeader
              label={baseBranchName || 'main'}
              count={rootSessions.length > 0 ? rootSessions.length : undefined}
            />
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

        return (
          <div key={ws.id} className="ml-2 border-l border-line pl-2">
            {renderWorkspaceRow(ws, wsSessions, isExpanded)}

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
        <div className="mt-3 ml-2 border-l border-line pl-2">
          <TreeDisclosureRow
            title="Archived"
            icon={<Archive aria-hidden className="size-3 shrink-0" />}
            expanded={archivedExpanded}
            locked={searching}
            tooltip="Archived workspaces and sessions"
            tooltipDetail={searchLock}
            ariaLabel={`${archivedExpanded ? 'Collapse' : 'Expand'} archived workspaces and sessions`}
            count={
              searching
                ? archivedWorkspaces.reduce(
                    (count, ws) => count + getWorkspaceSessions(ws.id).length,
                    0,
                  ) + archivedRootSessions.length
                : archivedWorkspaces.length + archivedRootSessions.length
            }
            onToggle={() => setShowArchived((current) => !current)}
          />

          {archivedExpanded && (
            <div className="ml-4 space-y-0.5">
              {archivedWorkspaces.map((ws) => {
                const wsSessions = getWorkspaceSessions(ws.id)
                if (searching && wsSessions.length === 0) return null
                const isExpanded = searching || effectiveExpanded.has(ws.id)

                return (
                  <div key={ws.id}>
                    {renderWorkspaceRow(ws, wsSessions, isExpanded)}

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
        <div className="mt-2 ml-2 text-xs">
          {/* Quiet words that act: a link Button, which has no box to undo. */}
          <Button
            type="button"
            variant="link"
            onClick={onOpenCreateWorkspace}
            className="gap-1 font-normal text-ink-muted hover:text-ink"
          >
            <Plus className="h-3 w-3" />
            New workspace
          </Button>
        </div>
      ) : null}
    </div>
  )
})
