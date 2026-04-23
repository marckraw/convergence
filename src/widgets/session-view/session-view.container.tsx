import { useEffect, useRef, useState, useCallback } from 'react'
import type { FC, MouseEvent as ReactMouseEvent } from 'react'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { useDialogStore } from '@/entities/dialog'
import { ComposerContainer } from '@/features/composer'
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
  MoreVertical,
  Square,
  FileCode,
  GitBranch,
  TerminalSquare,
} from 'lucide-react'
import { AttentionIndicator } from '@/shared/ui/attention-indicator.presentational'
import { ContextWindowIndicator } from '@/shared/ui/context-window-indicator.presentational'
import { cn } from '@/shared/lib/cn.pure'
import { ConversationItemView } from './transcript-entry.presentational'
import { ChangedFilesPanel } from './changed-files-panel.container'

const CHANGED_FILES_MIN_WIDTH = 320
const CHANGED_FILES_MAX_WIDTH = 960
const CHANGED_FILES_COMPACT_WIDTH = 320
const CHANGED_FILES_DEFAULT_EXPANDED_WIDTH = 720
type ChangedFilesMode = 'docked' | 'overlay'

export const SessionView: FC = () => {
  const activeProject = useProjectStore((s) => s.activeProject)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const draftWorkspaceId = useSessionStore((s) => s.draftWorkspaceId)
  const sessions = useSessionStore((s) => s.sessions)
  const activeConversation = useSessionStore((s) => s.activeConversation)
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const openDialog = useDialogStore((s) => s.open)
  const approveSession = useSessionStore((s) => s.approveSession)
  const denySession = useSessionStore((s) => s.denySession)
  const stopSession = useSessionStore((s) => s.stopSession)
  const hydratePaneTree = useTerminalStore((s) => s.hydratePaneTree)
  const closeAllTerminals = useTerminalStore((s) => s.closeAllForSession)
  const setPrimarySurface = useSessionStore((s) => s.setPrimarySurface)
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
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const changedFilesExpanded = changedFilesMode === 'overlay'

  const session = sessions.find((s) => s.id === activeSessionId) ?? null

  const scrollToBottom = useCallback(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [activeConversation.length, scrollToBottom])

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
      window.electronAPI.git
        .getCurrentBranch(session.workingDirectory)
        .then(setBranchName)
        .catch(() => setBranchName(null))
    }
  }, [session?.workingDirectory])

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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Transcript */}
        <div className="app-scrollbar flex-1 overflow-y-auto px-4">
          <div className="mx-auto max-w-2xl py-4">
            {activeConversation.map((entry, i) => {
              const isLastApproval =
                entry.kind === 'approval-request' &&
                session.attention === 'needs-approval' &&
                i === activeConversation.length - 1

              return (
                <ConversationItemView
                  key={entry.id}
                  entry={entry}
                  onApprove={
                    isLastApproval
                      ? () => approveSession(session.id)
                      : undefined
                  }
                  onDeny={
                    isLastApproval ? () => denySession(session.id) : undefined
                  }
                />
              )
            })}
            <div ref={transcriptEndRef} />
          </div>
        </div>

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
