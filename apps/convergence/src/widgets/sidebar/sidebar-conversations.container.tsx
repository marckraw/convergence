import { useMemo, type FC, type ReactNode } from 'react'
import type { Project } from '@/entities/project'
import type { WorkspacePullRequest } from '@/entities/pull-request'
import type { NeedsYouDismissals, SessionSummary } from '@/entities/session'
import type { TerminalIdleNotice } from '@/entities/terminal'
import type { Workspace } from '@/entities/workspace'
import {
  groupNeedsYou,
  needsYouCardModel,
  type CardContext,
} from '@/features/needs-you'
import type { AppSurface } from '@/shared/types/app-surface.types'
import {
  GlobalChatSessionList,
  type ChatSidebarSpace,
} from './global-chat-session-list.presentational'
import { NeedsYou } from './needs-you.container'
import { ProjectSwitcher } from './project-switcher.presentational'
import { ProjectTree } from './project-tree.container'
import { useSidebarConversationSearch } from './sidebar-search.container'
import { TerminalIdleSection } from './terminal-idle-section.presentational'

/**
 * Production owner of sidebar conversation-name search (R2/R7).
 *
 * Takes the FULL session lists, narrows them once, then feeds Activity cards
 * and the project tree. The root must render this container — it cannot skip
 * the narrowing by wiring NeedsYou / ProjectTree itself.
 */
export interface SidebarConversationsProps {
  collapsed: boolean
  globalSessions: readonly SessionSummary[]
  sessions: readonly SessionSummary[]
  headerStart: ReactNode
  headerEnd: ReactNode
  projects: readonly Project[]
  activeProject: Project | null
  endpoints: readonly { id: string; label: string }[]
  cardNow: number
  needsYouDismissals: NeedsYouDismissals
  activeSurface: AppSurface
  activeSessionId: string | null
  activeGlobalSessionId: string | null
  pulsingSessionIds?: Readonly<Record<string, true>>
  terminalIdleNotices: readonly TerminalIdleNotice[]
  onPin: (id: string, pinned: boolean) => void
  onSelectNeedsYou: (id: string) => void
  onDismissNeedsYou: (id: string) => void
  onArchiveSession: (id: string) => void
  onSelectTerminalIdle: (notice: TerminalIdleNotice) => void
  onDismissTerminalIdle: (id: string) => void
  chatSpaces: readonly ChatSidebarSpace[]
  ungroupedGlobalChatSessions: readonly SessionSummary[]
  selectedSpaceId: string | null
  expandedSpaceIds: ReadonlySet<string>
  archivedSpacesExpanded: boolean
  onNewGlobalSession: () => void
  onNewSpace: () => void
  onSelectSpace: (id: string) => void
  onToggleSpace: (id: string) => void
  onToggleArchivedSpaces: () => void
  onArchiveSpace: (id: string) => void
  onUnarchiveSpace: (id: string) => void
  onSelectSpaceAttempt: (sessionId: string) => void
  onSelectGlobalSession: (id: string) => void
  onManageSessionSpaces: (sessionId: string) => void
  onDetachSpaceAttempt: (attemptId: string, spaceId: string) => void
  onUnarchiveSession: (id: string) => void
  onDeleteGlobalChatSession: (id: string) => void
  onSelectProject: (projectId: string) => void
  onCreateProject: () => void
  cardContext: CardContext
  baseBranchName: string | null
  workspaces: readonly Workspace[]
  pullRequestsByWorkspaceId?: Readonly<Record<string, WorkspacePullRequest>>
  expandedWorkspaces?: ReadonlySet<string>
  onToggleWorkspace?: (id: string) => void
  onSelectSession: (id: string) => void
  onDeleteSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, name: string) => void
  regeneratingSessionIds?: ReadonlySet<string>
  onRegenerateSessionName: (id: string) => void
  onArchiveWorkspace?: (workspaceId: string) => void
  onUnarchiveWorkspace?: (workspaceId: string) => void
  onRemoveWorkspaceWorktree?: (workspaceId: string) => void
  onSyncWorkspaceEnvFiles?: (workspaceId: string) => void
  onDeleteWorkspace: (workspaceId: string) => void
  onOpenCreateWorkspace: () => void
}

export const SidebarConversations: FC<SidebarConversationsProps> = ({
  collapsed,
  globalSessions,
  sessions,
  headerStart,
  headerEnd,
  projects,
  activeProject,
  endpoints,
  cardNow,
  needsYouDismissals,
  activeSurface,
  activeSessionId,
  activeGlobalSessionId,
  pulsingSessionIds,
  terminalIdleNotices,
  onPin,
  onSelectNeedsYou,
  onDismissNeedsYou,
  onArchiveSession,
  onSelectTerminalIdle,
  onDismissTerminalIdle,
  chatSpaces,
  ungroupedGlobalChatSessions,
  selectedSpaceId,
  expandedSpaceIds,
  archivedSpacesExpanded,
  onNewGlobalSession,
  onNewSpace,
  onSelectSpace,
  onToggleSpace,
  onToggleArchivedSpaces,
  onArchiveSpace,
  onUnarchiveSpace,
  onSelectSpaceAttempt,
  onSelectGlobalSession,
  onManageSessionSpaces,
  onDetachSpaceAttempt,
  onUnarchiveSession,
  onDeleteGlobalChatSession,
  onSelectProject,
  onCreateProject,
  cardContext,
  baseBranchName,
  workspaces,
  pullRequestsByWorkspaceId,
  expandedWorkspaces,
  onToggleWorkspace,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  regeneratingSessionIds,
  onRegenerateSessionName,
  onArchiveWorkspace,
  onUnarchiveWorkspace,
  onRemoveWorkspaceWorktree,
  onSyncWorkspaceEnvFiles,
  onDeleteWorkspace,
  onOpenCreateWorkspace,
}) => {
  const search = useSidebarConversationSearch({
    globalSessions,
    sessions,
    collapsed,
  })

  const cardGroups = useMemo(
    () =>
      groupNeedsYou(
        search.searchedGlobalSessions.map((session) =>
          needsYouCardModel(session, {
            projectName:
              session.contextKind === 'global'
                ? 'Convergence'
                : (projects.find((project) => project.id === session.projectId)
                    ?.name ?? 'Unknown project'),
            endpoints,
            now: cardNow,
            dismissed:
              needsYouDismissals[session.id]?.updatedAt === session.updatedAt,
          }),
        ),
      ),
    [
      search.searchedGlobalSessions,
      projects,
      endpoints,
      cardNow,
      needsYouDismissals,
    ],
  )

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex items-center gap-1">{headerStart}</div>
        <div className="flex items-center gap-1">
          {search.toggleControl}
          {headerEnd}
        </div>
      </div>

      {search.field}

      <div className="app-scrollbar flex-1 overflow-x-hidden overflow-y-auto py-3">
        <NeedsYou
          groups={cardGroups}
          nameSearchQuery={search.query}
          onPin={onPin}
          activeSessionId={
            activeSurface === 'chat' ? activeGlobalSessionId : activeSessionId
          }
          pulsingSessionIds={pulsingSessionIds}
          onSelect={onSelectNeedsYou}
          onDismiss={onDismissNeedsYou}
          onArchive={onArchiveSession}
        />

        <TerminalIdleSection
          notices={[...terminalIdleNotices]}
          onSelect={onSelectTerminalIdle}
          onDismiss={onDismissTerminalIdle}
        />

        {(cardGroups.length > 0 || terminalIdleNotices.length > 0) && (
          <div className="mx-3 mb-3 border-t border-border/50" />
        )}

        {activeSurface === 'chat' ? (
          <GlobalChatSessionList
            spaces={[...chatSpaces]}
            sessions={[...ungroupedGlobalChatSessions]}
            nameSearchQuery={search.query}
            activeSessionId={activeGlobalSessionId}
            selectedSpaceId={selectedSpaceId}
            expandedSpaceIds={expandedSpaceIds}
            archivedSpacesExpanded={archivedSpacesExpanded}
            onNewSession={onNewGlobalSession}
            onNewSpace={onNewSpace}
            onSelectSpace={onSelectSpace}
            onToggleSpace={onToggleSpace}
            onToggleArchivedSpaces={onToggleArchivedSpaces}
            onArchiveSpace={onArchiveSpace}
            onUnarchiveSpace={onUnarchiveSpace}
            onSelectSpaceAttempt={onSelectSpaceAttempt}
            onSelectSession={onSelectGlobalSession}
            onManageSessionSpaces={onManageSessionSpaces}
            onDetachSpaceAttempt={onDetachSpaceAttempt}
            onArchiveSession={onArchiveSession}
            onUnarchiveSession={onUnarchiveSession}
            onDeleteSession={onDeleteGlobalChatSession}
          />
        ) : (
          <>
            {projects.length > 0 && (
              <ProjectSwitcher
                projects={[...projects]}
                activeProjectId={activeProject?.id ?? null}
                onSelectProject={onSelectProject}
                onCreateProject={onCreateProject}
              />
            )}

            {activeProject ? (
              <ProjectTree
                cardContext={cardContext}
                baseBranchName={baseBranchName}
                workspaces={[...workspaces]}
                sessions={search.searchedSessions}
                nameSearchQuery={search.query}
                activeSessionId={activeSessionId}
                pullRequestsByWorkspaceId={pullRequestsByWorkspaceId}
                pulsingSessionIds={pulsingSessionIds}
                expandedWorkspaces={expandedWorkspaces}
                onToggleWorkspace={onToggleWorkspace}
                onSelectSession={onSelectSession}
                onArchiveSession={onArchiveSession}
                onUnarchiveSession={onUnarchiveSession}
                onDeleteSession={onDeleteSession}
                onRenameSession={onRenameSession}
                regeneratingSessionIds={regeneratingSessionIds}
                onRegenerateSessionName={onRegenerateSessionName}
                onArchiveWorkspace={onArchiveWorkspace}
                onUnarchiveWorkspace={onUnarchiveWorkspace}
                onRemoveWorkspaceWorktree={onRemoveWorkspaceWorktree}
                onSyncWorkspaceEnvFiles={onSyncWorkspaceEnvFiles}
                onDeleteWorkspace={onDeleteWorkspace}
                onOpenCreateWorkspace={onOpenCreateWorkspace}
              />
            ) : (
              <div className="px-3 text-center">
                <p className="mb-3 text-sm text-muted-foreground">
                  No project loaded
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
