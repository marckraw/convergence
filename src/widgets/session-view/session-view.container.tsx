import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { FC, MouseEvent as ReactMouseEvent } from 'react'
import { useProjectStore } from '@/entities/project'
import type { CodeReviewMode } from '@/entities/code-review'
import {
  formatActivityLabel,
  useSessionStore,
  type SessionContextWindow,
} from '@/entities/session'
import { useDialogStore } from '@/entities/dialog'
import { useSpaceStore } from '@/entities/space'
import {
  usePullRequestStore,
  type WorkspacePullRequest,
} from '@/entities/pull-request'
import { gitApi, useWorkspaceStore } from '@/entities/workspace'
import { ComposerContainer } from '@/features/composer'
import { ProjectOpenMenuContainer } from '@/features/project-open-menu'
import { SessionDebugDrawerContainer } from '@/widgets/session-debug-drawer'
import { ProjectActionsMenu } from '@/widgets/project-actions-menu'
import { useAppSettingsStore } from '@/entities/app-settings'
import { attachmentApi, useAttachmentStore } from '@/entities/attachment'
import { useTerminalStore } from '@/entities/terminal'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import {
  Archive,
  ArrowLeftRight,
  Clock,
  GitFork,
  Link2,
  MoreVertical,
  ScrollText,
  Square,
  FileCode,
  GitBranch,
  GitPullRequest,
  TerminalSquare,
} from 'lucide-react'
import { AttentionIndicator } from '@/shared/ui/attention-indicator.presentational'
import { cn } from '@/shared/lib/cn.pure'
import { ChangedFilesPanel } from './changed-files-panel.container'
import { formatConversationTotalDuration } from './conversation-total-duration.pure'
import {
  SpaceContextPanel,
  type SpaceContextAttemptView,
} from './space-context-panel.presentational'
import { PullRequestPanel } from './pull-request-panel.presentational'
import { SessionHeaderDetailRow } from './session-header-detail-row.presentational'
import { SessionConversationSurface } from './session-conversation-surface.container'

const CHANGED_FILES_MIN_WIDTH = 320
const CHANGED_FILES_MAX_WIDTH = 960
const CHANGED_FILES_COMPACT_WIDTH = 320
const CHANGED_FILES_DEFAULT_EXPANDED_WIDTH = 720
type ChangedFilesMode = 'docked' | 'overlay'

interface SessionViewProps {
  onOpenCodeReview?: (search?: {
    targetId?: string | null
    mode?: CodeReviewMode
    file?: string | null
  }) => void
}

export const SessionView: FC<SessionViewProps> = ({ onOpenCodeReview }) => {
  const activeProject = useProjectStore((s) => s.activeProject)
  const projects = useProjectStore((s) => s.projects)
  const workspaces = useWorkspaceStore((s) => s.globalWorkspaces)
  const pullRequestsByWorkspaceId = usePullRequestStore((s) => s.byWorkspaceId)
  const pullRequestLoadingByWorkspaceId = usePullRequestStore(
    (s) => s.loadingByWorkspaceId,
  )
  const pullRequestErrorsByWorkspaceId = usePullRequestStore(
    (s) => s.errorByWorkspaceId,
  )
  const loadPullRequestByWorkspaceId = usePullRequestStore(
    (s) => s.loadByWorkspaceId,
  )
  const refreshPullRequestForSession = usePullRequestStore(
    (s) => s.refreshForSession,
  )
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const draftWorkspaceId = useSessionStore((s) => s.draftWorkspaceId)
  const beginSessionDraft = useSessionStore((s) => s.beginSessionDraft)
  const sessions = useSessionStore((s) => s.sessions)
  const activeConversation = useSessionStore((s) => s.activeConversation)
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const openDialog = useDialogStore((s) => s.open)
  const debugLoggingEnabled = useAppSettingsStore(
    (s) => s.settings.debugLogging.enabled,
  )
  const [debugDrawerOpen, setDebugDrawerOpen] = useState(false)
  const approveSession = useSessionStore((s) => s.approveSession)
  const denySession = useSessionStore((s) => s.denySession)
  const sendMessageToSession = useSessionStore((s) => s.sendMessageToSession)
  const stopSession = useSessionStore((s) => s.stopSession)
  const hydratePaneTree = useTerminalStore((s) => s.hydratePaneTree)
  const closeAllTerminals = useTerminalStore((s) => s.closeAllForSession)
  const setPrimarySurface = useSessionStore((s) => s.setPrimarySurface)
  const spaces = useSpaceStore((s) => s.spaces)
  const attemptsBySessionId = useSpaceStore((s) => s.attemptsBySessionId)
  const attemptsBySpaceId = useSpaceStore((s) => s.attemptsBySpaceId)
  const artifactsBySpaceId = useSpaceStore((s) => s.artifactsBySpaceId)
  const loadSpaces = useSpaceStore((s) => s.loadSpaces)
  const loadAttemptsForSession = useSpaceStore((s) => s.loadAttemptsForSession)
  const loadAttempts = useSpaceStore((s) => s.loadAttempts)
  const loadArtifacts = useSpaceStore((s) => s.loadArtifacts)
  const terminalTree = useTerminalStore((s) =>
    activeSessionId ? (s.treesBySessionId[activeSessionId] ?? null) : null,
  )
  const hasTerminal = terminalTree !== null
  const [showChangedFiles, setShowChangedFiles] = useState(false)
  const [showPullRequestPanel, setShowPullRequestPanel] = useState(false)
  const [changedFilesSide, setChangedFilesSide] = useState<'left' | 'right'>(
    'right',
  )
  const [changedFilesMode, setChangedFilesMode] =
    useState<ChangedFilesMode>('docked')
  const [changedFilesWidth, setChangedFilesWidth] = useState(
    CHANGED_FILES_COMPACT_WIDTH,
  )
  const [branchName, setBranchName] = useState<string | null>(null)
  const changedFilesDraggingRef = useRef(false)
  const sessionRootRef = useRef<HTMLDivElement>(null)
  const changedFilesExpanded = changedFilesMode === 'overlay'

  const session = sessions.find((s) => s.id === activeSessionId) ?? null
  const sessionWorkspace = session?.workspaceId
    ? (workspaces.find((entry) => entry.id === session.workspaceId) ?? null)
    : null
  const sessionOpenPath = sessionWorkspace?.worktreeRemovedAt
    ? (activeProject?.repositoryPath ?? null)
    : (sessionWorkspace?.path ?? session?.workingDirectory ?? null)
  const sessionWorktreeRemoved = !!sessionWorkspace?.worktreeRemovedAt
  const workspacePullRequest = session?.workspaceId
    ? (pullRequestsByWorkspaceId[session.workspaceId] ?? null)
    : null
  const pullRequestLoading = session?.workspaceId
    ? (pullRequestLoadingByWorkspaceId[session.workspaceId] ?? false)
    : false
  const pullRequestError = session?.workspaceId
    ? (pullRequestErrorsByWorkspaceId[session.workspaceId] ?? null)
    : null
  const activityLabel = formatActivityLabel(session?.activity)
  const totalDurationLabel = useMemo(
    () => formatConversationTotalDuration(activeConversation),
    [activeConversation],
  )
  const linkedSessionAttempts = session
    ? (attemptsBySessionId[session.id] ?? [])
    : []
  const linkedAttempt = linkedSessionAttempts[0] ?? null
  const linkedSpace =
    linkedAttempt !== null
      ? (spaces.find((space) => space.id === linkedAttempt.spaceId) ?? null)
      : null
  const linkedSpaceAttempts =
    linkedSpace !== null ? (attemptsBySpaceId[linkedSpace.id] ?? []) : []
  const linkedSpaceArtifacts =
    linkedSpace !== null ? (artifactsBySpaceId[linkedSpace.id] ?? []) : []

  const spaceAttemptViews = useMemo<SpaceContextAttemptView[]>(
    () =>
      linkedSpaceAttempts.map((attempt) => {
        const attemptSession =
          sessions.find((entry) => entry.id === attempt.sessionId) ??
          globalSessions.find((entry) => entry.id === attempt.sessionId) ??
          null
        const project = attemptSession
          ? projects.find((entry) => entry.id === attemptSession.projectId)
          : null
        const workspace =
          attemptSession?.workspaceId !== null &&
          attemptSession?.workspaceId !== undefined
            ? (workspaces.find(
                (entry) => entry.id === attemptSession.workspaceId,
              ) ?? null)
            : null

        return {
          attempt,
          sessionName: attemptSession?.name ?? 'Unknown session',
          projectName: project?.name ?? 'Unknown project',
          branchName: workspace?.branchName ?? null,
          providerId: attemptSession?.providerId ?? 'unknown',
        }
      }),
    [globalSessions, linkedSpaceAttempts, projects, sessions, workspaces],
  )

  useEffect(() => {
    if (!session) return
    void loadSpaces()
    void loadAttemptsForSession(session.id)
  }, [loadAttemptsForSession, loadSpaces, session])

  useEffect(() => {
    if (!linkedSpace) return
    void loadAttempts(linkedSpace.id)
    void loadArtifacts(linkedSpace.id)
  }, [linkedSpace, loadArtifacts, loadAttempts])

  useEffect(() => {
    if (!changedFilesExpanded) {
      return
    }

    setChangedFilesWidth((current) =>
      Math.max(current, getExpandedDrawerWidth()),
    )
  }, [changedFilesExpanded])

  // Load branch name for the session's working directory
  useEffect(() => {
    if (session?.workingDirectory) {
      gitApi
        .getCurrentBranch(session.workingDirectory)
        .then(setBranchName)
        .catch(() => setBranchName(null))
    }
  }, [session?.workingDirectory])

  useEffect(() => {
    if (!session?.workspaceId) return
    void loadPullRequestByWorkspaceId(session.workspaceId)
  }, [loadPullRequestByWorkspaceId, session?.workspaceId])

  useEffect(() => {
    const sessionId = session?.id ?? null
    const workspaceId = session?.workspaceId ?? null
    if (!showPullRequestPanel || !sessionId) return
    void refreshPullRequestForSession(sessionId, workspaceId)
  }, [
    refreshPullRequestForSession,
    session?.id,
    session?.workspaceId,
    showPullRequestPanel,
  ])

  // Hydrate attachment metadata for the active session so the transcript can render chips.
  const hydrateAttachments = useAttachmentStore((s) => s.hydrateForSession)
  useEffect(() => {
    if (!session) return
    const sessionId = session.id
    void attachmentApi
      .getForSession(sessionId)
      .then((items) => hydrateAttachments(sessionId, items))
      .catch(() => hydrateAttachments(sessionId, []))
  }, [session, hydrateAttachments])

  const handleChangedFilesResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      changedFilesDraggingRef.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const containerRect = sessionRootRef.current?.getBoundingClientRect()
      const containerLeft = containerRect?.left ?? 0
      const containerRight = containerRect?.right ?? window.innerWidth

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!changedFilesDraggingRef.current) {
          return
        }

        const nextWidth =
          changedFilesSide === 'right'
            ? containerRight - moveEvent.clientX
            : moveEvent.clientX - containerLeft

        setChangedFilesWidth(clampChangedFilesWidth(nextWidth))
      }

      const handleMouseUp = () => {
        changedFilesDraggingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [changedFilesSide],
  )

  const handleToggleExpanded = useCallback(() => {
    setChangedFilesMode((current) => {
      if (current === 'overlay') {
        setChangedFilesWidth(CHANGED_FILES_COMPACT_WIDTH)
        return 'docked'
      }

      setChangedFilesWidth((width) => Math.max(width, getExpandedDrawerWidth()))
      return 'overlay'
    })
  }, [])

  const handleToggleChangedFiles = useCallback(() => {
    setShowChangedFiles((current) => {
      if (current) {
        setChangedFilesMode('docked')
        setChangedFilesWidth(CHANGED_FILES_COMPACT_WIDTH)
        return false
      }

      setShowPullRequestPanel(false)
      return true
    })
  }, [])

  const handleTogglePullRequestPanel = useCallback(() => {
    setShowPullRequestPanel((current) => {
      const next = !current
      if (next) {
        setShowChangedFiles(false)
        setChangedFilesMode('docked')
        setChangedFilesWidth(CHANGED_FILES_COMPACT_WIDTH)
      }
      return next
    })
  }, [])

  // Empty state
  if (!session) {
    const draftWorkspace = draftWorkspaceId
      ? workspaces.find((w) => w.id === draftWorkspaceId)
      : null
    const draftOpenPath =
      draftWorkspace?.path ?? activeProject?.repositoryPath ?? null
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        <div
          className="flex h-12 shrink-0 items-center justify-end gap-1 border-b border-border px-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div
            className="flex items-center gap-1"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {activeProject && <ProjectActionsMenu project={activeProject} />}
            <ProjectOpenMenuContainer targetPath={draftOpenPath} />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-4">
            <p className="mb-1 text-lg font-medium">Convergence</p>
            <p className="mb-3 text-sm text-muted-foreground">
              What would you like to work on?
            </p>
            {activeProject && (
              <div className="mb-5 flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                {draftWorkspace ? (
                  <>
                    <span>
                      Starting in worktree:{' '}
                      <span className="font-medium text-foreground">
                        {draftWorkspace.branchName}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => beginSessionDraft(null)}
                      className="ml-1 h-auto px-2 py-0 text-xs"
                    >
                      Use main repo
                    </Button>
                  </>
                ) : (
                  <span>Starting in main repo</span>
                )}
              </div>
            )}
            {activeProject && (
              <ComposerContainer
                context={{
                  kind: 'project',
                  projectId: activeProject.id,
                  workspaceId: draftWorkspaceId,
                  activeSessionId: null,
                }}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderChangedFilesPanel = () => (
    <ChangedFilesPanel
      session={session}
      side={changedFilesSide}
      expanded={changedFilesExpanded}
      onClose={() => {
        setShowChangedFiles(false)
        setChangedFilesMode('docked')
        setChangedFilesWidth(CHANGED_FILES_COMPACT_WIDTH)
      }}
      onToggleSide={() =>
        setChangedFilesSide((current) =>
          current === 'right' ? 'left' : 'right',
        )
      }
      onToggleExpanded={handleToggleExpanded}
      onOpenCodeReview={onOpenCodeReview}
    />
  )

  return (
    <div ref={sessionRootRef} className="relative flex h-full overflow-hidden">
      {showChangedFiles &&
        changedFilesSide === 'left' &&
        !changedFilesExpanded && (
          <div className={cn('shrink-0', 'w-80')}>
            {renderChangedFilesPanel()}
          </div>
        )}

      {/* Main session area */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div
          className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div
            className="flex min-w-0 items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <span className="min-w-0 truncate text-sm font-medium">
              {session.name}
            </span>
            <AttentionIndicator attention={session.attention} />
            {activityLabel && (
              <span
                className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
                data-testid="session-activity-indicator"
              >
                {activityLabel}
              </span>
            )}
            {sessionWorktreeRemoved && (
              <span className="flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] text-warning-foreground">
                Worktree removed
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-full border border-border/70 px-2 text-[11px] text-muted-foreground"
                >
                  Session details
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80 p-2">
                <div className="grid gap-1.5 text-xs">
                  {session.parentSessionId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        session.parentSessionId &&
                        setActiveSession(session.parentSessionId)
                      }
                      className="h-auto justify-start gap-2 px-2 py-1.5 text-xs"
                    >
                      <GitFork className="h-3.5 w-3.5" />
                      Forked from:{' '}
                      {globalSessions.find(
                        (entry) => entry.id === session.parentSessionId,
                      )?.name ?? 'parent'}
                    </Button>
                  )}
                  <SessionHeaderDetailRow
                    icon={<GitBranch className="h-3.5 w-3.5" />}
                    label="Branch"
                    value={branchName ?? 'Unknown'}
                  />
                  <SessionHeaderDetailRow
                    icon={<GitPullRequest className="h-3.5 w-3.5" />}
                    label="Pull request"
                    value={
                      session.workspaceId
                        ? formatPullRequestHeaderLabel(
                            workspacePullRequest,
                            pullRequestLoading,
                          )
                        : 'No workspace'
                    }
                  />
                  {activityLabel && (
                    <SessionHeaderDetailRow
                      label="Activity"
                      value={activityLabel}
                    />
                  )}
                  {totalDurationLabel && (
                    <SessionHeaderDetailRow
                      icon={<Clock className="h-3.5 w-3.5" />}
                      label="Elapsed"
                      value={totalDurationLabel}
                      testId="session-total-duration"
                    />
                  )}
                  <SessionHeaderDetailRow
                    label="Context"
                    value={formatSessionContextLabel(session.contextWindow)}
                  />
                  {session.archivedAt && (
                    <SessionHeaderDetailRow
                      icon={<Archive className="h-3.5 w-3.5" />}
                      label="State"
                      value="Archived"
                    />
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div
            className="flex items-center gap-1"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {activeProject && <ProjectActionsMenu project={activeProject} />}
            <ProjectOpenMenuContainer targetPath={sessionOpenPath} />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleToggleChangedFiles}
              title="Changed files"
              aria-pressed={showChangedFiles ? true : undefined}
            >
              <FileCode className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleTogglePullRequestPanel}
              title="Pull request status"
              aria-pressed={showPullRequestPanel ? true : undefined}
            >
              <GitPullRequest className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                if (hasTerminal) {
                  void closeAllTerminals(session.id)
                } else {
                  void hydratePaneTree({
                    sessionId: session.id,
                    cwd: session.workingDirectory,
                    cols: 80,
                    rows: 24,
                  })
                }
              }}
              title={hasTerminal ? 'Close terminal' : 'Open terminal'}
              aria-pressed={hasTerminal ? true : undefined}
            >
              <TerminalSquare className="h-3.5 w-3.5" />
            </Button>
            {session.status === 'running' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => stopSession(session.id)}
              >
                <Square className="h-3 w-3" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="More actions"
                  aria-label="Session actions"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {session.providerId !== 'shell' && (
                  <DropdownMenuItem
                    onClick={() =>
                      openDialog('session-fork', {
                        parentSessionId: session.id,
                      })
                    }
                    className="gap-2"
                  >
                    <GitFork className="h-3.5 w-3.5" />
                    Fork session…
                  </DropdownMenuItem>
                )}
                {session.providerId !== 'shell' && (
                  <DropdownMenuItem
                    onClick={() =>
                      openDialog('space-session-link', {
                        sessionId: session.id,
                      })
                    }
                    className="gap-2"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Link to Space...
                  </DropdownMenuItem>
                )}
                {session.providerId !== 'shell' && (
                  <DropdownMenuItem
                    onClick={() => {
                      void setPrimarySurface(
                        session.id,
                        session.primarySurface === 'terminal'
                          ? 'conversation'
                          : 'terminal',
                      )
                    }}
                    className="gap-2"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    {session.primarySurface === 'terminal'
                      ? 'Show conversation as main'
                      : 'Show terminal as main'}
                  </DropdownMenuItem>
                )}
                {session.providerId !== 'shell' && debugLoggingEnabled && (
                  <DropdownMenuItem
                    onClick={() => setDebugDrawerOpen(true)}
                    className="gap-2"
                  >
                    <ScrollText className="h-3.5 w-3.5" />
                    Open debug log…
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <SessionConversationSurface
          session={session}
          conversationItems={activeConversation}
          composerContext={
            activeProject
              ? {
                  kind: 'project',
                  projectId: activeProject.id,
                  workspaceId: session.workspaceId,
                  activeSessionId: session.id,
                }
              : null
          }
          composerDisabledReason={
            sessionWorktreeRemoved
              ? "This workspace's git worktree was removed from disk. Conversation history is preserved, but new agent work is disabled until restore support exists."
              : null
          }
          onApprove={approveSession}
          onDeny={denySession}
          onInputAnswer={(sessionId, response, displayText) => {
            void sendMessageToSession(
              sessionId,
              displayText,
              undefined,
              undefined,
              'answer',
              response,
            )
          }}
        />
      </div>

      {/* Changed files side panel */}
      {showChangedFiles &&
        changedFilesSide === 'right' &&
        !changedFilesExpanded && (
          <div className={cn('shrink-0', 'w-80')}>
            {renderChangedFilesPanel()}
          </div>
        )}

      {showPullRequestPanel && !changedFilesExpanded && (
        <PullRequestPanel
          pullRequest={workspacePullRequest}
          branchName={branchName}
          loading={pullRequestLoading}
          error={pullRequestError}
          hasWorkspace={session.workspaceId !== null}
          onRefresh={() => {
            void refreshPullRequestForSession(session.id, session.workspaceId)
          }}
          onClose={() => setShowPullRequestPanel(false)}
        />
      )}

      {linkedSpace && !changedFilesExpanded && (
        <SpaceContextPanel
          space={linkedSpace}
          attempts={spaceAttemptViews}
          artifacts={linkedSpaceArtifacts}
          onOpenSpace={(spaceId) => openDialog('space-workboard', { spaceId })}
        />
      )}

      {showChangedFiles && changedFilesExpanded && (
        <div
          className={cn(
            'absolute inset-y-0 z-20 flex overflow-hidden shadow-2xl',
            changedFilesSide === 'right'
              ? 'right-0 flex-row'
              : 'left-0 flex-row-reverse',
          )}
          style={
            {
              width: changedFilesWidth,
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties
          }
        >
          <div
            onMouseDown={handleChangedFilesResizeStart}
            onDoubleClick={handleToggleExpanded}
            className={cn(
              'app-resize-handle relative z-10 w-px shrink-0 cursor-col-resize border-x-[6px] border-x-transparent bg-clip-content transition-colors hover:bg-white/10',
              changedFilesSide === 'right' ? '-ml-1.5' : '-mr-1.5',
            )}
          />
          <div className="min-w-0 flex-1">{renderChangedFilesPanel()}</div>
        </div>
      )}
      {session.providerId !== 'shell' && debugLoggingEnabled && (
        <SessionDebugDrawerContainer
          sessionId={session.id}
          open={debugDrawerOpen}
          onOpenChange={setDebugDrawerOpen}
        />
      )}
    </div>
  )
}

function formatPullRequestHeaderLabel(
  pullRequest: WorkspacePullRequest | null,
  loading: boolean,
): string {
  if (loading) return 'PR checking…'
  if (!pullRequest) return 'PR unknown'
  if (pullRequest.lookupStatus === 'not-found') return 'No PR'
  if (pullRequest.lookupStatus === 'gh-unavailable') return 'gh missing'
  if (pullRequest.lookupStatus === 'gh-auth-required') return 'gh auth needed'
  if (pullRequest.lookupStatus !== 'found') return 'PR unknown'
  if (pullRequest.number)
    return `PR #${pullRequest.number} ${pullRequest.state}`
  return pullRequest.state
}

function formatSessionContextLabel(
  contextWindow: SessionContextWindow | null,
): string {
  if (!contextWindow) return 'Unknown'
  if (contextWindow.availability === 'unavailable') return contextWindow.reason
  return `${contextWindow.remainingPercentage}% left`
}

function clampChangedFilesWidth(width: number): number {
  return Math.min(
    CHANGED_FILES_MAX_WIDTH,
    Math.max(CHANGED_FILES_MIN_WIDTH, width),
  )
}

function getExpandedDrawerWidth(): number {
  return clampChangedFilesWidth(
    Math.max(
      CHANGED_FILES_DEFAULT_EXPANDED_WIDTH,
      Math.floor(window.innerWidth * 0.68),
    ),
  )
}
