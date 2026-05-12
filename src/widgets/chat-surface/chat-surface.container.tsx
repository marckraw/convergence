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
import { MessageSquareText, Square } from 'lucide-react'
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
}

const EMPTY_SPACE_SOURCES: SpaceSource[] = []

const DEFAULT_ARTIFACT_DRAFT: SpaceArtifactDraft = {
  kind: 'documentation',
  label: '',
  value: '',
  sourceSessionId: '',
  status: 'ready',
}

export const ChatSurface: FC<ChatSurfaceProps> = ({ selectedSpaceId }) => {
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
  const selectedSpaceAttempts =
    selectedSpaceId === null ? [] : (attemptsBySpaceId[selectedSpaceId] ?? [])
  const selectedSpaceArtifacts =
    selectedSpaceId === null ? [] : (artifactsBySpaceId[selectedSpaceId] ?? [])
  const selectedSpaceSources =
    selectedSpaceId === null
      ? EMPTY_SPACE_SOURCES
      : (sourcesBySpaceId[selectedSpaceId] ?? EMPTY_SPACE_SOURCES)
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
    if (!selectedSpaceId) return
    void loadAttempts(selectedSpaceId)
    void loadArtifacts(selectedSpaceId)
    void loadSources(selectedSpaceId)
  }, [loadArtifacts, loadAttempts, loadSources, selectedSpaceId])

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
      const sourceIds = new Set(selectedSpaceSources.map((source) => source.id))
      const selectedSourceIds = [
        ...previous.selectedSourceIds.filter((id) => sourceIds.has(id)),
        ...selectedSpaceSources
          .map((source) => source.id)
          .filter((id) => !previous.selectedSourceIds.includes(id)),
      ]
      return { ...previous, selectedSourceIds }
    })
  }, [selectedSpaceId, selectedSpaceSources])

  const contextPreview = selectedSpace
    ? buildSpaceContextBlock({
        space: selectedSpace,
        sources: selectedSpaceSources,
        selection: contextSelection,
      })
    : null

  const handleGlobalSessionCreated = useCallback(
    async (createdSession: SessionSummary) => {
      if (!selectedSpaceId) return
      await linkAttempt({
        spaceId: selectedSpaceId,
        sessionId: createdSession.id,
        role: selectedSpaceAttempts.length === 0 ? 'seed' : 'implementation',
        isPrimary: selectedSpaceAttempts.length === 0,
      })
      await loadAttempts(selectedSpaceId)
    },
    [linkAttempt, loadAttempts, selectedSpaceAttempts.length, selectedSpaceId],
  )

  const handleOpenAttempt = useCallback(
    async (sessionId: string) => {
      const target = sessionLookup.get(sessionId)
      if (!target) return

      await switchToSession(sessionId)

      if (target.contextKind === 'global') {
        setActiveGlobalSession(sessionId)
        return
      }

      setActiveSurface('code')
      setActiveSession(sessionId)
    },
    [sessionLookup, setActiveGlobalSession, setActiveSession, setActiveSurface],
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

  const prepareSpaceAttemptMessage = useCallback(
    (message: string) => applySpaceContextToMessage(message, contextPreview),
    [contextPreview],
  )

  if (selectedSpaceId && selectedSpace && !session) {
    return (
      <SpaceHome
        space={selectedSpace}
        attempts={attemptViews}
        artifacts={selectedSpaceArtifacts}
        sources={selectedSpaceSources}
        activeTab={activeSpaceTab}
        onTabChange={setActiveSpaceTab}
        onOpenAttempt={handleOpenAttempt}
        onAddSources={handleAddSources}
        onDeleteSource={handleDeleteSource}
        artifactDraft={artifactDraft}
        editingArtifactId={editingArtifactId}
        briefDraft={briefDraft}
        memoryDraft={memoryDraft}
        contextSelection={contextSelection}
        contextPreview={contextPreview}
        onBriefDraftChange={setBriefDraft}
        onMemoryDraftChange={setMemoryDraft}
        onSaveBrief={handleSaveBrief}
        onSaveMemory={handleSaveMemory}
        onContextSelectionChange={setContextSelection}
        onArtifactDraftChange={setArtifactDraft}
        onSubmitArtifact={handleSubmitArtifact}
        onCancelArtifactEdit={handleCancelArtifactEdit}
        onEditArtifact={handleEditArtifact}
        onDeleteArtifact={handleDeleteArtifact}
        onAddArtifactFiles={handleAddArtifactFiles}
        newAttemptComposer={
          <ComposerContainer
            context={{ kind: 'global', activeSessionId: null }}
            onGlobalSessionCreated={handleGlobalSessionCreated}
            prepareNewSessionMessage={prepareSpaceAttemptMessage}
          />
        }
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
