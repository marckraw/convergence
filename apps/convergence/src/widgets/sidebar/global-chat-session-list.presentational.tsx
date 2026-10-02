import { SessionStateBadge } from '@/entities/session'
import { parallelWorkStatus } from '@/shared/lib/parallel-work.pure'
import {
  nameMatches,
  noConversationMatchesLine,
  normalizeNameQuery,
} from '@/shared/lib/name-search.pure'
import { memo } from 'react'
import type { SessionSummary } from '@/entities/session'
import type { SpaceAttemptRole } from '@/entities/space'
import {
  Button,
  cn,
  EmptyState,
  ListRow,
  MenuItem,
  MenuSeparator,
  IconButton,
  RowActions,
  SectionHeader,
  Tooltip,
} from '@convergence/ui'
import {
  Archive,
  ChevronRight,
  Folder,
  FolderPlus,
  Link2,
  MessageSquarePlus,
  Trash2,
  Unlink,
  Undo2,
} from 'lucide-react'
import { disclosureChevronClass, emptyListLine } from './sidebar.styles'

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
  spaces: readonly ChatSidebarSpace[]
  sessions: readonly SessionSummary[]
  activeSessionId: string | null
  selectedSpaceId: string | null
  expandedSpaceIds: ReadonlySet<string>
  archivedSpacesExpanded: boolean
  nameSearchQuery?: string
  /** Sessions a notification just touched: their rows pulse once, as the code tree's do (NAV-21). */
  pulsingSessionIds?: Readonly<Record<string, true>>
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

function narrowChatSpace(
  space: ChatSidebarSpace,
  query: string,
): ChatSidebarSpace | null {
  const matchingAttempts = space.attempts.filter((attempt) =>
    nameMatches(attempt.sessionName, query),
  )
  if (nameMatches(space.title, query)) {
    return space
  }
  if (matchingAttempts.length === 0) return null
  return { ...space, attempts: matchingAttempts }
}

export const GlobalChatSessionList = memo(function GlobalChatSessionList({
  spaces,
  sessions,
  activeSessionId,
  selectedSpaceId,
  expandedSpaceIds,
  archivedSpacesExpanded,
  nameSearchQuery = '',
  pulsingSessionIds,
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
}: GlobalChatSessionListProps) {
  const searching = normalizeNameQuery(nameSearchQuery).length > 0
  const visibleSpaces = searching
    ? spaces
        .map((space) => narrowChatSpace(space, nameSearchQuery))
        .filter((space): space is ChatSidebarSpace => space != null)
    : spaces
  const visibleSessions = searching
    ? sessions.filter((session) => nameMatches(session.name, nameSearchQuery))
    : sessions
  const activeSessions = visibleSessions.filter(
    (session) => !session.archivedAt,
  )
  const archivedSessions = visibleSessions.filter(
    (session) => session.archivedAt,
  )
  const activeSpaces = visibleSpaces.filter((space) => !space.archivedAt)
  const archivedSpaces = visibleSpaces.filter((space) => space.archivedAt)
  const showArchivedSpaces = archivedSpacesExpanded
  const nothingMatched =
    searching &&
    activeSpaces.length === 0 &&
    archivedSpaces.length === 0 &&
    activeSessions.length === 0 &&
    archivedSessions.length === 0

  const disclosureChevron = (open: boolean) => (
    <ChevronRight
      aria-hidden
      className={cn(disclosureChevronClass, 'size-3.5', open && 'rotate-90')}
    />
  )

  const renderSessionRow = (session: SessionSummary) => (
    <Tooltip key={session.id} label={session.name} side="right">
      <ListRow
        density="compact"
        selected={activeSessionId === session.id}
        render={<button type="button" />}
        data-pulse={pulsingSessionIds?.[session.id] ? 'true' : undefined}
        onClick={() => onSelectSession(session.id)}
        aria-label={`Open chat session ${session.name}`}
        leading={<SessionStateBadge session={session} />}
        title={session.name}
        meta={parallelWorkStatus(session) || undefined}
        actions={
          <RowActions label={`Chat session actions ${session.name}`}>
            {!session.archivedAt ? (
              <MenuItem onClick={() => onManageSessionSpaces(session.id)}>
                <Link2 className="h-3.5 w-3.5" />
                <span>Add to Space…</span>
              </MenuItem>
            ) : null}
            {session.archivedAt ? (
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
            {/* Deleting stands apart, as in the code tree's menu (NAV-14). */}
            <MenuSeparator />
            <MenuItem
              variant="danger"
              onClick={() => onDeleteSession(session.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete session…</span>
            </MenuItem>
          </RowActions>
        }
      />
    </Tooltip>
  )

  const renderAttemptRow = (
    space: ChatSidebarSpace,
    attempt: ChatSidebarSpaceAttempt,
  ) => (
    <Tooltip key={attempt.attemptId} label={attempt.sessionName} side="right">
      <ListRow
        density="compact"
        selected={activeSessionId === attempt.sessionId}
        render={<button type="button" />}
        data-pulse={pulsingSessionIds?.[attempt.sessionId] ? 'true' : undefined}
        onClick={() => onSelectSpaceAttempt(attempt.sessionId)}
        aria-label={`Open Space attempt ${attempt.sessionName}`}
        leading={<SessionStateBadge session={attempt.session} />}
        title={attempt.sessionName}
        meta={
          (attempt.session && parallelWorkStatus(attempt.session)) || undefined
        }
        actions={
          <RowActions label={`Space attempt actions ${attempt.sessionName}`}>
            <MenuItem onClick={() => onManageSessionSpaces(attempt.sessionId)}>
              <Link2 className="h-3.5 w-3.5" />
              <span>Manage Spaces…</span>
            </MenuItem>
            {attempt.session ? (
              attempt.session.archivedAt ? (
                <MenuItem onClick={() => onUnarchiveSession(attempt.sessionId)}>
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>Unarchive session</span>
                </MenuItem>
              ) : (
                <MenuItem onClick={() => onArchiveSession(attempt.sessionId)}>
                  <Archive className="h-3.5 w-3.5" />
                  <span>Archive session</span>
                </MenuItem>
              )
            ) : null}
            <MenuItem
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
            </MenuItem>
            {attempt.session ? <MenuSeparator /> : null}
            {attempt.session ? (
              <MenuItem
                variant="danger"
                onClick={() => onDeleteSession(attempt.sessionId)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete session…</span>
              </MenuItem>
            ) : null}
          </RowActions>
        }
      />
    </Tooltip>
  )

  return (
    <div className="px-3">
      {nothingMatched ? (
        <div role="status" className="mb-3">
          <EmptyState
            size="compact"
            title={noConversationMatchesLine(nameSearchQuery.trim())}
          />
        </div>
      ) : null}
      {!searching ? (
        <div className="mb-3 space-y-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onNewSession}
            className="w-full justify-start"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onNewSpace}
            className="w-full justify-start"
          >
            <FolderPlus className="h-4 w-4" />
            Create Space…
          </Button>
        </div>
      ) : null}

      {!nothingMatched ? (
        <>
          <div className="mb-3 ml-2 border-l border-line pl-2">
            <SectionHeader
              label="Spaces"
              count={activeSpaces.length > 0 ? activeSpaces.length : undefined}
            />
            {activeSpaces.length > 0 ? (
              <div className="space-y-0.5">
                {activeSpaces.map((space) => {
                  const expanded = expandedSpaceIds.has(space.id)
                  return (
                    <div key={space.id}>
                      <div className="flex min-w-0 items-center gap-0.5">
                        {/* Its own control: the row opens the Space, this folds its attempts. */}
                        <IconButton
                          label={`${expanded ? 'Collapse' : 'Expand'} Space ${space.title}`}
                          type="button"
                          variant="ghost"
                          aria-expanded={expanded}
                          onClick={() => onToggleSpace(space.id)}
                          size="xs"
                          className="shrink-0"
                        >
                          {disclosureChevron(expanded)}
                        </IconButton>

                        <Tooltip label={space.title} side="right">
                          <ListRow
                            density="compact"
                            selected={selectedSpaceId === space.id}
                            render={<button type="button" />}
                            onClick={() => onSelectSpace(space.id)}
                            aria-label={`Open Space ${space.title}`}
                            leading={<Folder aria-hidden />}
                            title={space.title}
                            trailing={
                              space.attempts.length > 0
                                ? space.attempts.length
                                : undefined
                            }
                            actions={
                              <RowActions
                                label={`Space actions ${space.title}`}
                              >
                                <MenuItem
                                  onClick={() => onArchiveSpace(space.id)}
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                  <span>Archive Space…</span>
                                </MenuItem>
                              </RowActions>
                            }
                          />
                        </Tooltip>
                      </div>

                      {expanded ? (
                        <div className="ml-6 mt-0.5 space-y-0.5">
                          {space.attempts.length > 0 ? (
                            space.attempts.map((attempt) =>
                              renderAttemptRow(space, attempt),
                            )
                          ) : (
                            <p className={emptyListLine}>No attempts yet</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : searching ? null : (
              <p className={emptyListLine}>No Spaces yet</p>
            )}
          </div>

          {archivedSpaces.length > 0 ? (
            <div className="mb-3 ml-2 border-l border-line pl-2">
              {/* One control folds the archived Spaces (NAV-13: it was two side by side). */}
              <ListRow
                density="compact"
                render={<button type="button" />}
                onClick={onToggleArchivedSpaces}
                aria-label={`${showArchivedSpaces ? 'Collapse' : 'Expand'} archived Spaces`}
                aria-expanded={showArchivedSpaces}
                leading={
                  <span className="flex items-center gap-1">
                    {disclosureChevron(showArchivedSpaces)}
                    <Archive aria-hidden className="size-3.5 shrink-0" />
                  </span>
                }
                title="Archived Spaces"
                trailing={archivedSpaces.length}
              />

              {showArchivedSpaces ? (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  {archivedSpaces.map((space) => (
                    <Tooltip key={space.id} label={space.title} side="right">
                      <ListRow
                        density="compact"
                        selected={selectedSpaceId === space.id}
                        render={<button type="button" />}
                        onClick={() => onSelectSpace(space.id)}
                        aria-label={`Open archived Space ${space.title}`}
                        leading={<Folder aria-hidden />}
                        title={space.title}
                        actions={
                          <RowActions
                            label={`Archived Space actions ${space.title}`}
                          >
                            <MenuItem
                              onClick={() => onUnarchiveSpace(space.id)}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              <span>Unarchive Space</span>
                            </MenuItem>
                          </RowActions>
                        }
                      />
                    </Tooltip>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mb-1 ml-2 border-l border-line pl-2">
            <SectionHeader
              label="Ungrouped chats"
              count={
                activeSessions.length > 0 ? activeSessions.length : undefined
              }
            />
            {activeSessions.length > 0 ? (
              activeSessions.map(renderSessionRow)
            ) : searching ? null : (
              <p className={emptyListLine}>No chats yet</p>
            )}
          </div>

          {archivedSessions.length > 0 ? (
            <div className="mt-3 ml-2 border-l border-line pl-2">
              <SectionHeader label="Archived" count={archivedSessions.length} />
              <div className="ml-4 space-y-0.5">
                {archivedSessions.map(renderSessionRow)}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
})
