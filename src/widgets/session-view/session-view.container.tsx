import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { FC, MouseEvent as ReactMouseEvent } from 'react'
import { useProjectStore } from '@/entities/project'
import { formatActivityLabel, useSessionStore } from '@/entities/session'
import { useDialogStore } from '@/entities/dialog'
import { useInitiativeStore } from '@/entities/initiative'
import { gitApi, useWorkspaceStore } from '@/entities/workspace'
import { ComposerContainer } from '@/features/composer'
import { SessionDebugDrawerContainer } from '@/widgets/session-debug-drawer'
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
  GitFork,
  Link2,
  MoreVertical,
  ScrollText,
  Square,
  FileCode,
  GitBranch,
  TerminalSquare,
} from 'lucide-react'
import { AttentionIndicator } from '@/shared/ui/attention-indicator.presentational'
import { ContextWindowIndicator } from '@/shared/ui/context-window-indicator.presentational'
import { cn } from '@/shared/lib/cn.pure'
import { ChangedFilesPanel } from './changed-files-panel.container'
import {
  InitiativeContextPanel,
  type InitiativeContextAttemptView,
} from './initiative-context-panel.presentational'
import { SessionTranscript } from './session-transcript.container'

const CHANGED_FILES_MIN_WIDTH = 320
const CHANGED_FILES_MAX_WIDTH = 960
const CHANGED_FILES_COMPACT_WIDTH = 320
const CHANGED_FILES_DEFAULT_EXPANDED_WIDTH = 720
type ChangedFilesMode = 'docked' | 'overlay'

export const SessionView: FC = () => {
  const activeProject = useProjectStore((s) => s.activeProject)
  const projects = useProjectStore((s) => s.projects)
  const workspaces = useWorkspaceStore((s) => s.globalWorkspaces)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const draftWorkspaceId = useSessionStore((s) => s.draftWorkspaceId)
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
  const stopSession = useSessionStore((s) => s.stopSession)
  const hydratePaneTree = useTerminalStore((s) => s.hydratePaneTree)
  const closeAllTerminals = useTerminalStore((s) => s.closeAllForSession)
  const setPrimarySurface = useSessionStore((s) => s.setPrimarySurface)
  const initiatives = useInitiativeStore((s) => s.initiatives)
  const attemptsBySessionId = useInitiativeStore((s) => s.attemptsBySessionId)
  const attemptsByInitiativeId = useInitiativeStore(
    (s) => s.attemptsByInitiativeId,
  )
  const outputsByInitiativeId = useInitiativeStore(
    (s) => s.outputsByInitiativeId,
  )
  const loadInitiatives = useInitiativeStore((s) => s.loadInitiatives)
  const loadAttemptsForSession = useInitiativeStore(
    (s) => s.loadAttemptsForSession,
  )
  const loadAttempts = useInitiativeStore((s) => s.loadAttempts)
  const loadOutputs = useInitiativeStore((s) => s.loadOutputs)
  const terminalTree = useTerminalStore((s) =>
    activeSessionId ? (s.treesBySessionId[activeSessionId] ?? null) : null,
  )
  const hasTerminal = terminalTree !== null
  const [showChangedFiles, setShowChangedFiles] = useState(false)
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
  const activityLabel = formatActivityLabel(session?.activity)
  const linkedSessionAttempts = session
    ? (attemptsBySessionId[session.id] ?? [])
    : []
  const linkedAttempt = linkedSessionAttempts[0] ?? null
  const linkedInitiative =
    linkedAttempt !== null
      ? (initiatives.find(
          (initiative) => initiative.id === linkedAttempt.initiativeId,
        ) ?? null)
      : null
  const linkedInitiativeAttempts =
    linkedInitiative !== null
      ? (attemptsByInitiativeId[linkedInitiative.id] ?? [])
      : []
  const linkedInitiativeOutputs =
    linkedInitiative !== null
      ? (outputsByInitiativeId[linkedInitiative.id] ?? [])
      : []

  const initiativeAttemptViews = useMemo<InitiativeContextAttemptView[]>(
    () =>
      linkedInitiativeAttempts.map((attempt) => {
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
    [globalSessions, linkedInitiativeAttempts, projects, sessions, workspaces],
  )

  useEffect(() => {
    if (!session) return
    void loadInitiatives()
    void loadAttemptsForSession(session.id)
  }, [loadAttemptsForSession, loadInitiatives, session])

  useEffect(() => {
    if (!linkedInitiative) return
    void loadAttempts(linkedInitiative.id)
    void loadOutputs(linkedInitiative.id)
  }, [linkedInitiative, loadAttempts, loadOutputs])

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

      return true
    })
  }, [])

  // Empty state
  if (!session) {
    return (
      <div className="flex h-full flex-col">
        <div
          className="h-12 shrink-0 border-b border-border"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <p className="mb-1 text-lg font-medium">Convergence</p>
          <p className="mb-8 text-sm text-muted-foreground">
            What would you like to work on?
          </p>
          {activeProject && (
            <ComposerContainer
              projectId={activeProject.id}
              workspaceId={draftWorkspaceId}
              activeSessionId={null}
            />
          )}
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
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div
          className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <span className="text-sm font-medium">{session.name}</span>
            <AttentionIndicator attention={session.attention} />
            {session.parentSessionId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  session.parentSessionId &&
                  setActiveSession(session.parentSessionId)
                }
                className="h-auto rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
                title="Open parent session"
              >
                <GitFork className="h-3 w-3" />
                Forked from:{' '}
                {globalSessions.find((s) => s.id === session.parentSessionId)
                  ?.name ?? 'parent'}
              </Button>
            )}
            {session.archivedAt && (
              <span className="flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                <Archive className="h-3 w-3" />
                Archived
              </span>
            )}
            {branchName && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                {branchName}
              </span>
            )}
            {activityLabel && (
              <span
                className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
                data-testid="session-activity-indicator"
              >
                {activityLabel}
              </span>
            )}
            <ContextWindowIndicator contextWindow={session.contextWindow} />
          </div>
          <div
            className="flex items-center gap-1"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleToggleChangedFiles}
              title="Changed files"
            >
              <FileCode className="h-3.5 w-3.5" />
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
                      openDialog('initiative-session-link', {
                        sessionId: session.id,
                      })
                    }
                    className="gap-2"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Link to Initiative...
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

        <SessionTranscript
          session={session}
          conversationItems={activeConversation}
          onApprove={approveSession}
          onDeny={denySession}
        />

        {/* Composer */}
        <div className="shrink-0 px-4 py-3">
          {activeProject && (
            <ComposerContainer
              projectId={activeProject.id}
              workspaceId={session.workspaceId}
              activeSessionId={session.id}
            />
          )}
        </div>
      </div>

      {/* Changed files side panel */}
      {showChangedFiles &&
        changedFilesSide === 'right' &&
        !changedFilesExpanded && (
          <div className={cn('shrink-0', 'w-80')}>
            {renderChangedFilesPanel()}
          </div>
        )}

      {linkedInitiative && !changedFilesExpanded && (
        <InitiativeContextPanel
          initiative={linkedInitiative}
          attempts={initiativeAttemptViews}
          outputs={linkedInitiativeOutputs}
          onOpenInitiative={(initiativeId) =>
            openDialog('initiative-workboard', { initiativeId })
          }
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
