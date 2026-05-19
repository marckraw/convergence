import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useAppSurfaceStore } from '@/entities/app-surface'
import {
  spaceApi,
  useSpaceStore,
  type SpaceArtifact,
  type SpaceSource,
} from '@/entities/space'
import type { SessionSummary } from '@/entities/session'
import { formatActivityLabel, useSessionStore } from '@/entities/session'
import { switchToSession } from '@/features/command-center'
import { ComposerContainer } from '@/features/composer'
import { SessionConversationSurface } from '@/widgets/session-view'
import { AttentionIndicator } from '@/shared/ui/attention-indicator.presentational'
import { Button } from '@/shared/ui/button'
import { ContextWindowIndicator } from '@/shared/ui/context-window-indicator.presentational'
import { Input } from '@/shared/ui/input'
import { CheckSquare, Folder, MessageSquareText, Square } from 'lucide-react'
import {
  SpaceHome,
  type SpaceArtifactDraft,
  type SpaceHomeTab,
} from './space-home.presentational'
import {
  applySpaceContextToMessage,
  buildSpaceContextBlock,
  type SpaceContextSelection,
} from './space-context.pure'

interface ChatSurfaceProps {
  selectedSpaceId: string | null
  draftSpaceId?: string | null
  onBeginSpaceAttempt?: (spaceId: string) => void
  onCancelSpaceAttempt?: () => void
  onSpaceDeleted?: (spaceId: string) => void
  onOpenSession?: (session: SessionSummary) => void
}

const EMPTY_SPACE_SOURCES: SpaceSource[] = []

const DEFAULT_ARTIFACT_DRAFT: SpaceArtifactDraft = {
  kind: 'documentation',
  label: '',
  value: '',
  sourceSessionId: '',
  status: 'ready',
}

export const ChatSurface: FC<ChatSurfaceProps> = ({
  selectedSpaceId,
  draftSpaceId = null,
  onBeginSpaceAttempt,
  onCancelSpaceAttempt,
  onSpaceDeleted,
  onOpenSession,
}) => {
  const sessions = useSessionStore((state) => state.globalChatSessions)
  const globalSessions = useSessionStore((state) => state.globalSessions)
  const projectSessions = useSessionStore((state) => state.sessions)
  const spaces = useSpaceStore((state) => state.spaces)
  const attemptsBySpaceId = useSpaceStore((state) => state.attemptsBySpaceId)
  const artifactsBySpaceId = useSpaceStore((state) => state.artifactsBySpaceId)
  const sourcesBySpaceId = useSpaceStore((state) => state.sourcesBySpaceId)
  const loadAttempts = useSpaceStore((state) => state.loadAttempts)
  const loadArtifacts = useSpaceStore((state) => state.loadArtifacts)
  const loadSources = useSpaceStore((state) => state.loadSources)
  const updateSpace = useSpaceStore((state) => state.updateSpace)
  const addArtifact = useSpaceStore((state) => state.addArtifact)
  const addArtifactsFromPaths = useSpaceStore(
    (state) => state.addArtifactsFromPaths,
  )
  const updateArtifact = useSpaceStore((state) => state.updateArtifact)
  const deleteArtifact = useSpaceStore((state) => state.deleteArtifact)
  const addSourcesFromPaths = useSpaceStore(
    (state) => state.addSourcesFromPaths,
  )
  const deleteSource = useSpaceStore((state) => state.deleteSource)
  const linkAttempt = useSpaceStore((state) => state.linkAttempt)
  const archiveSpace = useSpaceStore((state) => state.archiveSpace)
  const unarchiveSpace = useSpaceStore((state) => state.unarchiveSpace)
  const deleteSpace = useSpaceStore((state) => state.deleteSpace)
  const activeSessionId = useSessionStore(
    (state) => state.activeGlobalSessionId,
  )
  const setActiveSession = useSessionStore((state) => state.setActiveSession)
  const setActiveGlobalSession = useSessionStore(
    (state) => state.setActiveGlobalSession,
  )
  const conversationItems = useSessionStore(
    (state) => state.activeGlobalConversation,
  )
  const approveSession = useSessionStore((state) => state.approveSession)
  const denySession = useSessionStore((state) => state.denySession)
  const stopSession = useSessionStore((state) => state.stopSession)
  const deleteSession = useSessionStore((state) => state.deleteSession)
  const loadGlobalSessions = useSessionStore(
    (state) => state.loadGlobalSessions,
  )
  const loadGlobalChatSessions = useSessionStore(
    (state) => state.loadGlobalChatSessions,
  )
  const loadProjectSessions = useSessionStore((state) => state.loadSessions)
  const setActiveSurface = useAppSurfaceStore((state) => state.setActiveSurface)
  const [activeSpaceTab, setActiveSpaceTab] = useState<SpaceHomeTab>('chats')
  const [briefDraft, setBriefDraft] = useState('')
  const [memoryDraft, setMemoryDraft] = useState('')
  const [artifactDraft, setArtifactDraft] = useState<SpaceArtifactDraft>(
    DEFAULT_ARTIFACT_DRAFT,
  )
  const [editingArtifactId, setEditingArtifactId] = useState<string | null>(
    null,
  )
  const [contextSelection, setContextSelection] =
    useState<SpaceContextSelection>({
      includeBrief: true,
      includeMemory: true,
      selectedSourceIds: [],
    })

  const session = sessions.find((entry) => entry.id === activeSessionId) ?? null
  const selectedSpace =
    spaces.find((entry) => entry.id === selectedSpaceId) ?? null
  const draftSpace =
    spaces.find((entry) => entry.id === draftSpaceId) ?? selectedSpace
  const activeSpaceId = draftSpaceId ?? selectedSpaceId
  const activeSpace = draftSpaceId ? draftSpace : selectedSpace
  const selectedSpaceAttempts =
    selectedSpaceId === null ? [] : (attemptsBySpaceId[selectedSpaceId] ?? [])
  const activeSpaceAttempts =
    activeSpaceId === null ? [] : (attemptsBySpaceId[activeSpaceId] ?? [])
  const selectedSpaceArtifacts =
    selectedSpaceId === null ? [] : (artifactsBySpaceId[selectedSpaceId] ?? [])
  const selectedSpaceSources =
    selectedSpaceId === null
      ? EMPTY_SPACE_SOURCES
      : (sourcesBySpaceId[selectedSpaceId] ?? EMPTY_SPACE_SOURCES)
  const activeSpaceSources =
    activeSpaceId === null
      ? EMPTY_SPACE_SOURCES
      : (sourcesBySpaceId[activeSpaceId] ?? EMPTY_SPACE_SOURCES)
  const activityLabel = formatActivityLabel(session?.activity)
  const sessionLookup = useMemo(() => {
    const next = new Map<string, SessionSummary>()
    for (const entry of globalSessions) next.set(entry.id, entry)
    for (const entry of sessions) next.set(entry.id, entry)
    for (const entry of projectSessions) next.set(entry.id, entry)
    return next
  }, [globalSessions, projectSessions, sessions])

  const attemptViews = useMemo(
    () =>
      selectedSpaceAttempts.map((attempt) => ({
        attempt,
        session: sessionLookup.get(attempt.sessionId) ?? null,
      })),
    [selectedSpaceAttempts, sessionLookup],
  )

  useEffect(() => {
    if (!activeSpaceId) return
    void loadAttempts(activeSpaceId)
    void loadArtifacts(activeSpaceId)
    void loadSources(activeSpaceId)
  }, [activeSpaceId, loadArtifacts, loadAttempts, loadSources])

  useEffect(() => {
    setActiveSpaceTab('chats')
    setArtifactDraft(DEFAULT_ARTIFACT_DRAFT)
    setEditingArtifactId(null)
  }, [selectedSpaceId])

  useEffect(() => {
    setBriefDraft(selectedSpace?.brief ?? '')
    setMemoryDraft(selectedSpace?.memory ?? '')
  }, [selectedSpace?.brief, selectedSpace?.id, selectedSpace?.memory])

  useEffect(() => {
    setContextSelection((previous) => {
      const sourceIds = new Set(activeSpaceSources.map((source) => source.id))
      const selectedSourceIds = [
        ...previous.selectedSourceIds.filter((id) => sourceIds.has(id)),
        ...activeSpaceSources
          .map((source) => source.id)
          .filter((id) => !previous.selectedSourceIds.includes(id)),
      ]
      return { ...previous, selectedSourceIds }
    })
  }, [activeSpaceId, activeSpaceSources])

  const contextPreview = activeSpace
    ? buildSpaceContextBlock({
        space: activeSpace,
        sources: activeSpaceSources,
        selection: contextSelection,
      })
    : null
  const selectedSourceSet = useMemo(
    () => new Set(contextSelection.selectedSourceIds),
    [contextSelection.selectedSourceIds],
  )

  const handleGlobalSessionCreated = useCallback(
    async (createdSession: SessionSummary) => {
      if (!activeSpaceId) return
      await linkAttempt({
        spaceId: activeSpaceId,
        sessionId: createdSession.id,
        role: activeSpaceAttempts.length === 0 ? 'seed' : 'implementation',
        isPrimary: activeSpaceAttempts.length === 0,
      })
      await loadAttempts(activeSpaceId)
      onCancelSpaceAttempt?.()
    },
    [
      activeSpaceAttempts.length,
      activeSpaceId,
      linkAttempt,
      loadAttempts,
      onCancelSpaceAttempt,
    ],
  )

  const handleOpenAttempt = useCallback(
    async (sessionId: string) => {
      const target = sessionLookup.get(sessionId)
      if (!target) return

      if (onOpenSession) {
        onOpenSession(target)
        return
      }

      await switchToSession(sessionId)

      if (target.contextKind === 'global') {
        setActiveGlobalSession(sessionId)
        return
      }

      setActiveSurface('code')
      setActiveSession(sessionId)
    },
    [
      onOpenSession,
      sessionLookup,
      setActiveGlobalSession,
      setActiveSession,
      setActiveSurface,
    ],
  )

  const handleAddSources = useCallback(async () => {
    if (!selectedSpaceId) return
    const paths = await spaceApi.showSourceOpenDialog()
    if (!paths || paths.length === 0) return
    await addSourcesFromPaths(selectedSpaceId, paths)
  }, [addSourcesFromPaths, selectedSpaceId])

  const handleDeleteSource = useCallback(
    async (sourceId: string) => {
      if (!selectedSpaceId) return
      await deleteSource(sourceId, selectedSpaceId)
    },
    [deleteSource, selectedSpaceId],
  )

  const handleSubmitArtifact = useCallback(async () => {
    if (!selectedSpaceId) return
    const input = {
      kind: artifactDraft.kind,
      label: artifactDraft.label.trim(),
      value: artifactDraft.value.trim(),
      sourceSessionId: artifactDraft.sourceSessionId || null,
      status: artifactDraft.status,
    }
    if (input.label.length === 0 || input.value.length === 0) return

    if (editingArtifactId) {
      await updateArtifact(editingArtifactId, selectedSpaceId, input)
    } else {
      await addArtifact({ spaceId: selectedSpaceId, ...input })
    }

    setArtifactDraft(DEFAULT_ARTIFACT_DRAFT)
    setEditingArtifactId(null)
  }, [
    addArtifact,
    artifactDraft,
    editingArtifactId,
    selectedSpaceId,
    updateArtifact,
  ])

  const handleEditArtifact = useCallback((artifact: SpaceArtifact) => {
    setArtifactDraft({
      kind: artifact.kind,
      label: artifact.label,
      value: artifact.value,
      sourceSessionId: artifact.sourceSessionId ?? '',
      status: artifact.status,
    })
    setEditingArtifactId(artifact.id)
  }, [])

  const handleCancelArtifactEdit = useCallback(() => {
    setArtifactDraft(DEFAULT_ARTIFACT_DRAFT)
    setEditingArtifactId(null)
  }, [])

  const handleDeleteArtifact = useCallback(
    async (artifactId: string) => {
      if (!selectedSpaceId) return
      await deleteArtifact(artifactId, selectedSpaceId)
      if (editingArtifactId === artifactId) {
        setArtifactDraft(DEFAULT_ARTIFACT_DRAFT)
        setEditingArtifactId(null)
      }
    },
    [deleteArtifact, editingArtifactId, selectedSpaceId],
  )

  const handleAddArtifactFiles = useCallback(async () => {
    if (!selectedSpaceId) return
    const paths = await spaceApi.showArtifactOpenDialog()
    if (!paths || paths.length === 0) return
    await addArtifactsFromPaths({ spaceId: selectedSpaceId, paths })
  }, [addArtifactsFromPaths, selectedSpaceId])

  const handleSaveBrief = useCallback(async () => {
    if (!selectedSpaceId) return
    await updateSpace(selectedSpaceId, { brief: briefDraft })
  }, [briefDraft, selectedSpaceId, updateSpace])

  const handleSaveMemory = useCallback(async () => {
    if (!selectedSpaceId) return
    await updateSpace(selectedSpaceId, { memory: memoryDraft })
  }, [memoryDraft, selectedSpaceId, updateSpace])

  const handleDeleteSpace = useCallback(async () => {
    if (!selectedSpaceId || !selectedSpace) return

    const linkedSessions = attemptViews
      .map(({ session }) => session)
      .filter((entry): entry is SessionSummary => entry !== null)
    const sessionCount = linkedSessions.length
    const confirmed = window.confirm(
      `Delete Space "${selectedSpace.title}"?\n\nThis will permanently delete the Space and ${sessionCount} attached session${sessionCount === 1 ? '' : 's'}. This cannot be undone.`,
    )
    if (!confirmed) return

    for (const linkedSession of linkedSessions) {
      await deleteSession(linkedSession.id, linkedSession.projectId)
    }
    await deleteSpace(selectedSpaceId)
    onSpaceDeleted?.(selectedSpaceId)
  }, [
    attemptViews,
    deleteSession,
    deleteSpace,
    onSpaceDeleted,
    selectedSpace,
    selectedSpaceId,
  ])

  const refreshLinkedSessions = useCallback(async () => {
    const projectIds = [
      ...new Set(
        attemptViews
          .map(({ session }) => session?.projectId)
          .filter((id): id is string => id !== null && id !== undefined),
      ),
    ]
    await Promise.all([
      loadGlobalSessions(),
      loadGlobalChatSessions(),
      ...projectIds.map((projectId) => loadProjectSessions(projectId)),
    ])
  }, [
    attemptViews,
    loadGlobalChatSessions,
    loadGlobalSessions,
    loadProjectSessions,
  ])

  const handleArchiveSpace = useCallback(async () => {
    if (!selectedSpaceId || !selectedSpace) return

    const sessionCount = attemptViews.filter(({ session }) => session).length
    const confirmed = window.confirm(
      `Archive Space "${selectedSpace.title}"?\n\nThis will hide the Space from the active list and archive ${sessionCount} attached session${sessionCount === 1 ? '' : 's'}.`,
    )
    if (!confirmed) return

    const archived = await archiveSpace(selectedSpaceId)
    if (!archived) return
    await refreshLinkedSessions()
    onSpaceDeleted?.(selectedSpaceId)
  }, [
    archiveSpace,
    attemptViews,
    onSpaceDeleted,
    refreshLinkedSessions,
    selectedSpace,
    selectedSpaceId,
  ])

  const handleUnarchiveSpace = useCallback(async () => {
    if (!selectedSpaceId) return
    const unarchived = await unarchiveSpace(selectedSpaceId)
    if (!unarchived) return
    await refreshLinkedSessions()
  }, [refreshLinkedSessions, selectedSpaceId, unarchiveSpace])

  const prepareSpaceAttemptMessage = useCallback(
    (message: string) => applySpaceContextToMessage(message, contextPreview),
    [contextPreview],
  )

  if (draftSpaceId && draftSpace && !session) {
    return (
      <div className="flex h-full flex-col">
        <div
          className="h-12 shrink-0 border-b border-border"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
          <p className="mb-1 text-lg font-medium">Convergence</p>
          <p className="mb-3 text-sm text-muted-foreground">
            What would you like to work on?
          </p>
          <div className="mb-5 flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            <Folder className="h-3 w-3" />
            <span>
              Starting in Space:{' '}
              <span className="font-medium text-foreground">
                {draftSpace.title}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelSpaceAttempt}
              className="ml-1 h-auto px-2 py-0 text-xs"
            >
              Open Space
            </Button>
          </div>
          <div className="mb-3 w-full max-w-2xl rounded-lg border border-border/70 bg-card/30 px-3 py-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
              <CheckSquare className="h-3.5 w-3.5" />
              <span>Context for this chat</span>
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <Input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={contextSelection.includeBrief}
                  onChange={(event) =>
                    setContextSelection({
                      ...contextSelection,
                      includeBrief: event.target.checked,
                    })
                  }
                />
                <span>Space brief</span>
              </label>
              <label className="flex items-center gap-2">
                <Input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={contextSelection.includeMemory}
                  onChange={(event) =>
                    setContextSelection({
                      ...contextSelection,
                      includeMemory: event.target.checked,
                    })
                  }
                />
                <span>Space memory/instructions</span>
              </label>
              {activeSpaceSources.length > 0 ? (
                <div className="space-y-1 border-t border-border/60 pt-2">
                  <div className="text-xs text-muted-foreground">
                    Selected sources
                  </div>
                  {activeSpaceSources.map((source) => (
                    <label
                      key={source.id}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <Input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={selectedSourceSet.has(source.id)}
                        onChange={(event) => {
                          const nextSourceIds = event.target.checked
                            ? [...contextSelection.selectedSourceIds, source.id]
                            : contextSelection.selectedSourceIds.filter(
                                (id) => id !== source.id,
                              )
                          setContextSelection({
                            ...contextSelection,
                            selectedSourceIds: nextSourceIds,
                          })
                        }}
                      />
                      <span className="truncate">{source.filename}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <pre className="app-scrollbar mt-3 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/60 bg-background/70 p-2 text-xs text-muted-foreground">
              {contextPreview ?? 'No Space context selected.'}
            </pre>
          </div>
          <ComposerContainer
            context={{ kind: 'global', activeSessionId: null }}
            onGlobalSessionCreated={handleGlobalSessionCreated}
            prepareNewSessionMessage={prepareSpaceAttemptMessage}
          />
        </div>
      </div>
    )
  }

  if (selectedSpaceId && selectedSpace && !session) {
    return (
      <SpaceHome
        space={selectedSpace}
        attempts={attemptViews}
        artifacts={selectedSpaceArtifacts}
        sources={selectedSpaceSources}
        activeTab={activeSpaceTab}
        onTabChange={setActiveSpaceTab}
        onBeginAttempt={() => onBeginSpaceAttempt?.(selectedSpaceId)}
        onOpenAttempt={handleOpenAttempt}
        onAddSources={handleAddSources}
        onDeleteSource={handleDeleteSource}
        onArchiveSpace={handleArchiveSpace}
        onUnarchiveSpace={handleUnarchiveSpace}
        onDeleteSpace={handleDeleteSpace}
        artifactDraft={artifactDraft}
        editingArtifactId={editingArtifactId}
        briefDraft={briefDraft}
        memoryDraft={memoryDraft}
        onBriefDraftChange={setBriefDraft}
        onMemoryDraftChange={setMemoryDraft}
        onSaveBrief={handleSaveBrief}
        onSaveMemory={handleSaveMemory}
        onArtifactDraftChange={setArtifactDraft}
        onSubmitArtifact={handleSubmitArtifact}
        onCancelArtifactEdit={handleCancelArtifactEdit}
        onEditArtifact={handleEditArtifact}
        onDeleteArtifact={handleDeleteArtifact}
        onAddArtifactFiles={handleAddArtifactFiles}
      />
    )
  }

  if (!session) {
    return (
      <div className="flex h-full flex-col">
        <div
          className="flex h-12 shrink-0 items-center border-b border-border px-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageSquareText className="h-4 w-4 text-muted-foreground" />
            Chat
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
          <p className="mb-1 text-lg font-medium">Convergence Chat</p>
          <p className="mb-5 text-sm text-muted-foreground">
            Start a project-free agent conversation.
          </p>
          <ComposerContainer
            context={{ kind: 'global', activeSessionId: null }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex min-w-0 items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <MessageSquareText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{session.name}</span>
          <AttentionIndicator attention={session.attention} />
          {session.archivedAt ? (
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
              Archived
            </span>
          ) : null}
          {activityLabel ? (
            <span
              className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
              data-testid="chat-session-activity-indicator"
            >
              {activityLabel}
            </span>
          ) : null}
          <ContextWindowIndicator contextWindow={session.contextWindow} />
        </div>
        {session.status === 'running' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Stop session"
            onClick={() => stopSession(session.id)}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Square className="h-3 w-3" />
          </Button>
        ) : null}
      </div>

      <SessionConversationSurface
        session={session}
        conversationItems={conversationItems}
        composerContext={{ kind: 'global', activeSessionId: session.id }}
        onApprove={approveSession}
        onDeny={denySession}
      />
    </div>
  )
}
