import { usePerfSessionsIdentity } from '@/shared/lib/usePerfProbe'
import { toast } from 'sonner'
import { useHarnessFacts } from './use-harness-facts'
import { HarnessAlertChip } from './harness-alert-chip.presentational'
import { HarnessFactsSections } from './harness-facts.presentational'
import { ParallelWork } from './parallel-work.container'
import { SIDE_PANEL_WIDTH } from './parallel-work-dock.pure'
import { useParallelWork } from './use-parallel-work'
import { isRemoteExecutionHost } from '@/entities/execution-host'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { FC } from 'react'
import { flushSync } from 'react-dom'
import { selectProjectName, useProjectStore } from '@/entities/project'
import {
  AttentionIndicator,
  useSessionStore,
  type InteractionResponse,
  type SessionContextWindow,
} from '@/entities/session'
import {
  resolveSessionActivityLabel,
  useContextDrillStore,
} from '@/entities/context-drill'
import { useDialogStore } from '@/entities/dialog'
import { useSpaceStore } from '@/entities/space'
import { useSessionPullRequest } from './pull-request-session.container'
import { gitApi, useWorkspaceStore } from '@/entities/workspace'
import {
  ComposerContainer,
  type ComposerSessionContext,
} from '@/features/composer'
import { ProjectOpenMenuContainer } from '@/features/project-open-menu'
import { SessionDebugDrawerContainer } from '@/widgets/session-debug-drawer'
import { ProjectActionsMenu } from '@/widgets/project-actions-menu'
import {
  executionHostApi,
  useAppSettingsStore,
  type RemoteSessionWorkspaceResult,
} from '@/entities/app-settings'
import { attachmentApi, useAttachmentStore } from '@/entities/attachment'
import { useTerminalStore } from '@/entities/terminal'
import { Button } from '@/shared/ui/button'
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'
import {
  Archive,
  ArrowLeftRight,
  Cloud,
  GitFork,
  Link2,
  Pin,
  ScrollText,
  Square,
  GitBranch,
  GitPullRequest,
} from 'lucide-react'
import {
  formatConversationTotalDuration,
  readStreamingDurationTarget,
} from './conversation-total-duration.pure'
import { referencedAttachmentIdsKey } from './referenced-attachments.pure'
import { resolveRemoteSessionDetails } from './remote-session-details.pure'
import {
  SpaceContextPanel,
  type SpaceContextAttemptView,
} from './space-context-panel.presentational'
import { PullRequestPanel } from './pull-request-panel.presentational'
import { SessionHeaderDetailRow } from './session-header-detail-row.presentational'
import { useAgentMeterStore, SessionAgentMeter } from '@/entities/agent-meter'
import {
  ConversationHeader,
  headerFocusTarget,
} from './conversation-header.container'
import { parallelWorkInRow } from './conversation-header.pure'
import {
  ConversationDetailsMenu,
  DETAILS_SECTION,
} from './conversation-details-menu.container'
import { ConversationProjectMenu } from './conversation-project-menu.container'
import { ConversationViewMenu } from './conversation-view-menu.container'
import { harnessPill } from './harness-facts.pure'
import { SessionConversationSurface } from './session-conversation-surface.container'
import { SessionElapsedDuration } from './session-elapsed-duration.container'

export const SessionView: FC = () => {
  const activeProject = useProjectStore((s) => s.activeProject)
  const projects = useProjectStore((s) => s.projects)
  const workspaces = useWorkspaceStore((s) => s.globalWorkspaces)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const draftWorkspaceId = useSessionStore((s) => s.draftWorkspaceId)
  const beginSessionDraft = useSessionStore((s) => s.beginSessionDraft)
  const sessions = useSessionStore((s) => s.sessions)
  // The S0 denominator: how often the project's summary list changes identity.
  // Counted here because this view still subscribes to the list whole (space
  // attempts read other sessions' names); the composer no longer does
  // (MAR-3325), so it could no longer see the changes it is measured against.
  usePerfSessionsIdentity(sessions)
  const conversationPrefix = useSessionStore((s) => s.activeConversationPrefix)
  const handleLoadOlder = useCallback((retry?: boolean) => {
    const id = useSessionStore.getState().activeSessionId
    if (id) void useSessionStore.getState().loadOlderConversation(id, retry)
  }, [])
  const conversationWindow = useSessionStore((s) => s.activeConversationWindow)
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
  const setPinned = useSessionStore((s) => s.setPinned)
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
  const [showPullRequestPanel, setShowPullRequestPanel] = useState(false)
  const [branchName, setBranchName] = useState<string | null>(null)
  const [remoteWorkspace, setRemoteWorkspace] =
    useState<RemoteSessionWorkspaceResult | null>(null)
  const sessionRootRef = useRef<HTMLDivElement>(null)

  const [parallelOpen, setParallelOpen] = useState(false)
  const [parallelSelection, setParallelSelection] = useState<{
    sessionId: string
    id: string | null
  } | null>(null)
  const [parallelNavigation, setParallelNavigation] = useState<{
    id: string
    nonce: number
  } | null>(null)
  const parallelButton = useRef<HTMLButtonElement>(null)
  const parallelInvoker = useRef<HTMLElement | null>(null)
  // The header's groups, each a menu whose open state lives here, so More
  // opens a yielded one through the same `open` (MAR-3429 CH4).
  const [viewOpen, setViewOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsAt, setDetailsAt] = useState<string | null>(null)
  const [projectOpen, setProjectOpen] = useState(false)
  const viewTrigger = useRef<HTMLButtonElement>(null)
  const detailsTrigger = useRef<HTMLButtonElement>(null)
  const projectTrigger = useRef<HTMLButtonElement>(null)
  const harnessChip = useRef<HTMLButtonElement>(null)
  /** The harness chip, when it opened Details: focus goes back to it. */
  const detailsInvoker = useRef<HTMLElement | null>(null)
  const meterRow = useAgentMeterStore((state) =>
    state.snapshot.rows.find((row) => row.sessionId === activeSessionId),
  )
  const session = sessions.find((s) => s.id === activeSessionId) ?? null
  const supportsHarnessFacts =
    session?.providerId === 'claude-code' &&
    !isRemoteExecutionHost(session.executionHost)
  const harness = useHarnessFacts(supportsHarnessFacts ? activeSessionId : null)
  // The session's own project, never the one selected in the sidebar (R1):
  // its name in the header, and its tools in the Project group (CH4 R4).
  const sessionProjectName = useProjectStore(
    selectProjectName(session?.projectId ?? null),
  )
  const sessionProject =
    projects.find((project) => project.id === session?.projectId) ?? null
  const parallel = useParallelWork(activeSessionId)
  // The transcript is a memo boundary (MAR-3310 F1e R2): what it is handed
  // keeps its identity until what it does changes.
  const selectParallel = useCallback(
    (id: string | null) => {
      if (!parallelOpen && document.activeElement instanceof HTMLElement)
        parallelInvoker.current = document.activeElement
      if (activeSessionId)
        setParallelSelection({ sessionId: activeSessionId, id })
      setParallelOpen(true)
    },
    [parallelOpen, activeSessionId],
  )
  const answerInput = useCallback(
    (sessionId: string, response: InteractionResponse, displayText: string) => {
      void sendMessageToSession({
        sessionId,
        text: displayText,
        deliveryMode: 'answer',
        interactionResponse: response,
      })
    },
    [sendMessageToSession],
  )
  // The panel hands focus back to what opened it: the row's Parallel work
  // button, or View when it was opened from there -- and More in View's
  // place when View has yielded (MAR-3427 D, MAR-3429 CH4 R1).
  const focusParallelInvoker = () =>
    headerFocusTarget(
      parallelInvoker.current?.isConnected
        ? parallelInvoker.current
        : (parallelButton.current ?? viewTrigger.current),
    )?.focus()
  // The close is committed before focus is decided: the row's button may
  // have left while the panel was open (nothing runs any more), so the target
  // is read from the header as it is once the panel has closed.
  const closeParallel = () => {
    flushSync(() => setParallelOpen(false))
    focusParallelInvoker()
  }
  const remoteSessionId = isRemoteExecutionHost(session?.executionHost)
    ? (session?.id ?? null)
    : null

  useEffect(() => {
    setRemoteWorkspace(null)
    if (!remoteSessionId) return
    let cancelled = false
    void executionHostApi
      .getSessionWorkspace(remoteSessionId)
      .then((result) => {
        if (!cancelled) setRemoteWorkspace(result)
      })
    return () => {
      cancelled = true
    }
  }, [remoteSessionId])
  const sessionWorkspace = session?.workspaceId
    ? (workspaces.find((entry) => entry.id === session.workspaceId) ?? null)
    : null
  const sessionOpenPath = sessionWorkspace?.worktreeRemovedAt
    ? (sessionProject?.repositoryPath ?? null)
    : (sessionWorkspace?.path ?? session?.workingDirectory ?? null)
  const sessionWorktreeRemoved = !!sessionWorkspace?.worktreeRemovedAt
  const {
    reading: prReading,
    loading: pullRequestLoading,
    refresh: refreshPullRequest,
  } = useSessionPullRequest(session?.id)
  const sessionPullRequest = session?.pullRequest ?? null
  const pullRequestMessage =
    sessionPullRequest &&
    (prReading?.pullRequest?.checkedAt !== sessionPullRequest.checkedAt ||
      prReading?.pullRequest?.url !== sessionPullRequest.url)
      ? null
      : (prReading?.message ?? null)
  const pullRequestLabel = pullRequestLoading
    ? 'PR checking…'
    : sessionPullRequest
      ? `#${sessionPullRequest.number} · ${sessionPullRequest.state}`
      : (pullRequestMessage ?? 'PR unknown')
  /**
   * The remote rows, or null on a local session (MAR-2718).
   *
   * Null is what tells the panel to render its local `Branch` and `Pull
   * request` rows, so the two readings are exclusive by construction rather
   * than by two conditions that have to keep agreeing.
   */
  const remoteDetails =
    session && isRemoteExecutionHost(session.executionHost)
      ? resolveRemoteSessionDetails({
          workAddress: session.workAddress,
          recordedWorkspace: session.reportedWorkspace,
          fetched: remoteWorkspace
            ? remoteWorkspace.ok
              ? {
                  ok: true,
                  workspace: remoteWorkspace.info.workspace,
                }
              : { ok: false, message: remoteWorkspace.message }
            : null,
        })
      : null
  // The drill's beat, when one runs, replaces the activity pill (MAR-3288 R8).
  const drillBeat = useContextDrillStore((s) =>
    session ? s.beats[session.id] : undefined,
  )
  const activityLabel = resolveSessionActivityLabel(
    session?.activity,
    drillBeat,
  )
  // List-change only (MAR-3310 F1e R4). The open details row extends this
  // with one item's live updatedAt; an append does not walk the list again.
  const elapsedReading = useMemo(() => {
    const label = formatConversationTotalDuration(
      conversationPrefix,
      activeConversation,
    )
    return {
      label,
      ...readStreamingDurationTarget(conversationPrefix, activeConversation),
    }
  }, [conversationPrefix, activeConversation])
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

  // Keyed on the id, never the summary object: a streaming conversation's
  // summary changes ~4x a second, and each reload is two IPC calls plus a
  // space-store loading flip that redraws the shell (MAR-3377 R2).
  const openSessionId = session?.id ?? null
  useEffect(() => {
    if (!openSessionId) return
    void loadSpaces()
    void loadAttemptsForSession(openSessionId)
  }, [loadAttemptsForSession, loadSpaces, openSessionId])

  useEffect(() => {
    if (!linkedSpace) return
    void loadAttempts(linkedSpace.id)
    void loadArtifacts(linkedSpace.id)
  }, [linkedSpace, loadArtifacts, loadAttempts])

  // Load branch name for the session's working directory
  useEffect(() => {
    if (session?.workingDirectory) {
      gitApi
        .getCurrentBranch(session.workingDirectory)
        .then(setBranchName)
        .catch(() => setBranchName(null))
    }
  }, [session?.workingDirectory])

  // The PR is read again whenever something that shows it opens: its panel,
  // Details (its row) or the Project group (its item).
  useEffect(() => {
    if (showPullRequestPanel || detailsOpen || projectOpen)
      void refreshPullRequest()
  }, [refreshPullRequest, showPullRequestPanel, detailsOpen, projectOpen])

  // Hydrate attachment metadata for the active session so the transcript can
  // render chips. It re-reads when the session changes and when the transcript
  // starts referencing an attachment set it did not before -- a first message
  // sent from a new-session or fork draft carries ids that were resolved under
  // the draft's key, not this session's. A status update changes neither, so
  // it no longer costs an IPC call (MAR-3377 R2).
  const hydrateAttachments = useAttachmentStore((s) => s.hydrateForSession)
  const referencedAttachmentKey = useMemo(
    () => referencedAttachmentIdsKey(activeConversation),
    [activeConversation],
  )
  useEffect(() => {
    if (!openSessionId) return
    const sessionId = openSessionId
    void attachmentApi
      .getForSession(sessionId)
      .then((items) => hydrateAttachments(sessionId, items))
      .catch(() => hydrateAttachments(sessionId, []))
  }, [openSessionId, referencedAttachmentKey, hydrateAttachments])

  const handleTogglePullRequestPanel = useCallback(() => {
    setShowPullRequestPanel((current) => !current)
  }, [])
  // Closed from its own panel, focus goes back to the Project group it is
  // opened from -- or More, when the group has yielded (MAR-3429 CH4 R9).
  const closePullRequestPanel = () => {
    flushSync(() => setShowPullRequestPanel(false))
    headerFocusTarget(projectTrigger.current)?.focus()
  }

  // Where the composer is aimed, built once per aim (MAR-3325). This view
  // redraws for every streamed token of the open conversation, and the
  // composer below it is a memo boundary: an inline literal here would be a
  // new prop on each of those redraws.
  const activeProjectId = activeProject?.id ?? null
  const sessionWorkspaceId = session?.workspaceId ?? null
  const composerContext = useMemo<ComposerSessionContext | null>(
    () =>
      activeProjectId && openSessionId
        ? {
            kind: 'project',
            projectId: activeProjectId,
            workspaceId: sessionWorkspaceId,
            activeSessionId: openSessionId,
          }
        : null,
    [activeProjectId, openSessionId, sessionWorkspaceId],
  )
  const draftComposerContext = useMemo<ComposerSessionContext | null>(
    () =>
      activeProjectId
        ? {
            kind: 'project',
            projectId: activeProjectId,
            workspaceId: draftWorkspaceId,
            activeSessionId: null,
          }
        : null,
    [activeProjectId, draftWorkspaceId],
  )

  // Empty state
  if (!session) {
    const draftWorkspace = draftWorkspaceId
      ? workspaces.find((w) => w.id === draftWorkspaceId)
      : null
    const draftOpenPath =
      draftWorkspace?.path ?? activeProject?.repositoryPath ?? null
    const title = activeProject?.name ?? 'Convergence'
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
            {activeProject && (
              <ProjectActionsMenu
                project={activeProject}
                runtimeCwd={draftOpenPath}
              />
            )}
            <ProjectOpenMenuContainer targetPath={draftOpenPath} />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-4">
            <p
              className="mb-1 max-w-full truncate text-lg font-medium"
              title={title}
            >
              {title}
            </p>
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
            {draftComposerContext && (
              <ComposerContainer context={draftComposerContext} />
            )}
          </div>
        </div>
      </div>
    )
  }

  const toggleParallel = () => {
    if (parallelOpen) closeParallel()
    else {
      parallelInvoker.current = parallelButton.current
      setParallelOpen(true)
    }
  }
  // Parallel work's history, from View: the panel opens and gives focus back
  // to View when it closes.
  const openParallelHistory = () => {
    parallelInvoker.current = viewTrigger.current
    setParallelOpen(true)
  }
  const toggleTerminal = () => {
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
  }
  const togglePin = () =>
    void setPinned(session.id, !session.pinnedAt).catch((error) =>
      toast.error(error instanceof Error ? error.message : String(error)),
    )
  const parallelLabel = parallelWorkInRow(session.parallelWork)
  const harnessAlert = supportsHarnessFacts ? harnessPill(harness.facts) : null
  const remote = isRemoteExecutionHost(session.executionHost)
  // Details opens at the top from its own trigger (or from More), and at the
  // harness from the harness alert chip, which then takes focus back.
  const changeDetailsOpen = (open: boolean) => {
    if (open) {
      setDetailsAt(null)
      detailsInvoker.current = null
    }
    setDetailsOpen(open)
  }
  const openDetailsAtHarness = () => {
    setDetailsAt('harness')
    detailsInvoker.current = harnessChip.current
    setDetailsOpen(true)
  }

  return (
    <div
      ref={sessionRootRef}
      data-session-row
      className="relative flex h-full overflow-hidden"
    >
      {/* Main session area */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <ConversationHeader
          projectName={sessionProjectName ?? 'Unknown project'}
          conversationName={session.name}
          pinned={!!session.pinnedAt}
          slots={[
            // Parallel work holds a place in the row only while it matters,
            // and then it is live status (CH4 R2). Its history is in View.
            ...(parallelLabel
              ? [
                  {
                    id: 'parallel-work',
                    side: 'left' as const,
                    group: 'status' as const,
                    node: (
                      <Button
                        ref={parallelButton}
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        aria-expanded={parallelOpen}
                        onClick={toggleParallel}
                      >
                        {parallelLabel}
                      </Button>
                    ),
                  },
                ]
              : []),
            {
              id: 'attention',
              side: 'left',
              group: 'status',
              node: (
                <AttentionIndicator
                  parallelWork={session.parallelWork}
                  attention={session.attention}
                  status={session.status}
                  activity={session.activity}
                />
              ),
            },
            ...(remote
              ? [
                  {
                    id: 'remote',
                    side: 'left' as const,
                    group: 'status' as const,
                    node: (
                      <span
                        className="flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-600 dark:text-sky-300"
                        title="This session runs on the remote execution host"
                        data-testid="session-remote-indicator"
                      >
                        <Cloud className="h-3 w-3" />
                        Remote
                      </span>
                    ),
                  },
                ]
              : []),
            ...(activityLabel
              ? [
                  {
                    id: 'activity',
                    side: 'left' as const,
                    group: 'status' as const,
                    node: (
                      <span
                        className="max-w-[12rem] truncate rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
                        title={activityLabel}
                        data-testid="session-activity-indicator"
                      >
                        {activityLabel}
                      </span>
                    ),
                  },
                ]
              : []),
            ...(sessionWorktreeRemoved
              ? [
                  {
                    id: 'worktree-removed',
                    side: 'left' as const,
                    group: 'status' as const,
                    node: (
                      <span className="flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] text-warning-foreground">
                        Worktree removed
                      </span>
                    ),
                  },
                ]
              : []),
            // The harness is in the row only while it alerts, naming the
            // cause; it opens Details at the harness (CH4 R3).
            ...(harnessAlert?.alert
              ? [
                  {
                    id: 'harness',
                    side: 'left' as const,
                    group: 'status' as const,
                    node: (
                      <HarnessAlertChip
                        ref={harnessChip}
                        label={harnessAlert.label}
                        expanded={detailsOpen && detailsAt === 'harness'}
                        onOpen={openDetailsAtHarness}
                      />
                    ),
                  },
                ]
              : []),
            {
              id: 'view',
              side: 'right',
              group: 'control',
              node: (focus) => (
                <ConversationViewMenu
                  sessionId={session.id}
                  open={viewOpen}
                  onOpenChange={setViewOpen}
                  onOpenParallelWork={openParallelHistory}
                  triggerRef={viewTrigger}
                  contentFocus={focus}
                />
              ),
              entries: [
                { kind: 'opens', key: 'view', onOpen: () => setViewOpen(true) },
              ],
            },
            {
              id: 'details',
              side: 'right',
              group: 'control',
              node: (focus) => (
                <ConversationDetailsMenu
                  open={detailsOpen}
                  onOpenChange={changeDetailsOpen}
                  openAt={detailsAt}
                  invoker={detailsInvoker}
                  triggerRef={detailsTrigger}
                  contentFocus={focus}
                >
                  <section
                    aria-label="Session"
                    {...{ [DETAILS_SECTION]: 'session' }}
                  >
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
                      {remoteDetails ? (
                        <>
                          <SessionHeaderDetailRow
                            icon={<Cloud className="h-3.5 w-3.5" />}
                            label="Execution host"
                            value="Remote daemon"
                          />
                          {/*
                    What this session was told, above what the daemon says
                    it did (MAR-2689). A row written before the work address
                    existed reads "Unknown" rather than a repository
                    re-derived from a local checkout it may never have
                    matched.
                  */}
                          <SessionHeaderDetailRow
                            label="Works in"
                            value={remoteDetails.worksIn}
                          />
                          {remoteDetails.remoteRepository && (
                            <SessionHeaderDetailRow
                              label="Remote repository"
                              value={remoteDetails.remoteRepository}
                            />
                          )}
                          {remoteDetails.branch && (
                            <SessionHeaderDetailRow
                              icon={<GitBranch className="h-3.5 w-3.5" />}
                              label="Remote branch"
                              value={remoteDetails.branch}
                            />
                          )}
                          {remoteDetails.requestedBranch && (
                            <SessionHeaderDetailRow
                              label="Branch requested"
                              value={remoteDetails.requestedBranch}
                            />
                          )}
                          <SessionHeaderDetailRow
                            icon={<GitPullRequest className="h-3.5 w-3.5" />}
                            label="Pull request"
                            value={pullRequestLabel}
                          />
                          {remoteDetails.unreadable && (
                            <SessionHeaderDetailRow
                              label="Remote workspace"
                              value={remoteDetails.unreadable}
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <SessionHeaderDetailRow
                            icon={<GitBranch className="h-3.5 w-3.5" />}
                            label="Checkout branch"
                            value={branchName ?? 'Unknown'}
                          />
                          <SessionHeaderDetailRow
                            icon={<GitPullRequest className="h-3.5 w-3.5" />}
                            label="Pull request"
                            value={pullRequestLabel}
                          />
                        </>
                      )}
                      {activityLabel && (
                        <SessionHeaderDetailRow
                          label="Activity"
                          value={activityLabel}
                        />
                      )}
                      <SessionElapsedDuration
                        label={elapsedReading.label}
                        totalMs={elapsedReading.totalMs}
                        streamingItem={elapsedReading.streamingItem}
                        turnSpan={elapsedReading.turnSpan}
                      />
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
                  </section>
                  {supportsHarnessFacts && (
                    <section
                      aria-label="Harness history"
                      tabIndex={-1}
                      className="mt-2 border-t border-border/70 px-2 pt-2 outline-none"
                      {...{ [DETAILS_SECTION]: 'harness' }}
                    >
                      <h3 className="mb-1 text-[11px] text-muted-foreground">
                        Harness
                      </h3>
                      <HarnessFactsSections
                        facts={harness.facts}
                        error={harness.error}
                        loading={harness.loading}
                        onRetry={harness.retry}
                      />
                    </section>
                  )}
                  {(remote || meterRow?.usage) && (
                    <section
                      aria-label="Agent"
                      className="mt-2 border-t border-border/70 pt-2"
                      {...{ [DETAILS_SECTION]: 'agent' }}
                    >
                      <SessionAgentMeter row={meterRow} remote={remote} />
                    </section>
                  )}
                </ConversationDetailsMenu>
              ),
              entries: [
                {
                  kind: 'opens',
                  key: 'details',
                  onOpen: () => changeDetailsOpen(true),
                },
              ],
            },
            {
              id: 'project',
              side: 'right',
              group: 'control',
              node: (focus) => (
                <ConversationProjectMenu
                  project={sessionProject}
                  runtimeCwd={session.workingDirectory}
                  openPath={sessionOpenPath}
                  pullRequestLabel={pullRequestLabel}
                  pullRequestOpen={showPullRequestPanel}
                  onTogglePullRequest={handleTogglePullRequestPanel}
                  hasTerminal={hasTerminal}
                  onToggleTerminal={toggleTerminal}
                  open={projectOpen}
                  onOpenChange={setProjectOpen}
                  triggerRef={projectTrigger}
                  contentFocus={focus}
                />
              ),
              entries: [
                {
                  kind: 'opens',
                  key: 'project',
                  onOpen: () => setProjectOpen(true),
                },
              ],
            },
            ...(session.status === 'running'
              ? [
                  {
                    id: 'stop',
                    side: 'right' as const,
                    group: 'stop' as const,
                    node: (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Stop ${session.name}`}
                        title={`Stop ${session.name}`}
                        onClick={() => stopSession(session.id)}
                      >
                        <Square className="h-3 w-3" />
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
          moreContent={
            <>
              <DropdownMenuItem
                role="menuitemcheckbox"
                aria-checked={!!session.pinnedAt}
                onSelect={togglePin}
                className="gap-2"
              >
                <Pin className="h-3.5 w-3.5" />
                {session.pinnedAt ? 'Unpin conversation' : 'Pin conversation'}
              </DropdownMenuItem>
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
            </>
          }
        />

        <SessionConversationSurface
          compactions={harness.facts?.compactions}
          session={session}
          hasOlder={conversationWindow.hasOlder}
          oldestSequence={conversationWindow.oldestSequence}
          loadingOlder={conversationWindow.loading}
          olderError={conversationWindow.error}
          snapshotVersion={conversationWindow.snapshotVersion}
          onLoadOlder={handleLoadOlder}
          conversationPrefix={conversationPrefix}
          conversationItems={activeConversation}
          parallelRows={parallel.rows}
          parallelLoading={!parallel.hasRecord}
          parallelError={parallel.error}
          onParallelRetry={parallel.retry}
          onParallelSelect={selectParallel}
          navigationTarget={parallelNavigation}
          composerContext={composerContext}
          composerDisabledReason={
            sessionWorktreeRemoved
              ? "This workspace's git worktree was removed from disk. Conversation history is preserved, but new agent work is disabled until restore support exists."
              : null
          }
          onApprove={approveSession}
          onDeny={denySession}
          onInputAnswer={answerInput}
        />
      </div>

      <ParallelWork
        key={session.id}
        session={session}
        rows={parallel.rows}
        items={activeConversation}
        open={parallelOpen}
        selectedId={
          parallelSelection?.sessionId === session.id
            ? parallelSelection.id
            : null
        }
        onSelect={selectParallel}
        onClose={closeParallel}
        onNavigate={(id) =>
          setParallelNavigation((previous) => ({
            id,
            nonce: (previous?.nonce ?? 0) + 1,
          }))
        }
        loading={parallel.loading}
        error={parallel.error}
        rowRef={sessionRootRef}
        onReturnFocus={focusParallelInvoker}
        otherDockedWidths={[
          showPullRequestPanel ? SIDE_PANEL_WIDTH : 0,
          linkedSpace ? SIDE_PANEL_WIDTH : 0,
        ]}
      />

      {showPullRequestPanel && (
        <PullRequestPanel
          pullRequest={sessionPullRequest}
          branchName={
            sessionPullRequest?.headBranch ?? prReading?.branchName ?? null
          }
          loading={pullRequestLoading}
          error={pullRequestMessage}
          onRefresh={() => {
            void refreshPullRequest()
          }}
          onClose={closePullRequestPanel}
        />
      )}

      {linkedSpace && (
        <SpaceContextPanel
          space={linkedSpace}
          attempts={spaceAttemptViews}
          artifacts={linkedSpaceArtifacts}
          onOpenSpace={(spaceId) => openDialog('space-workboard', { spaceId })}
        />
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

function formatSessionContextLabel(
  contextWindow: SessionContextWindow | null,
): string {
  if (!contextWindow) return 'Unknown'
  if (contextWindow.availability === 'unavailable') return contextWindow.reason
  return `${contextWindow.remainingPercentage}% left`
}
