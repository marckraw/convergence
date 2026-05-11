import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { GitBranch } from 'lucide-react'
import { useDialogStore } from '@/entities/dialog'
import {
  useSpaceStore,
  type Space,
  type SpaceAttemptRole,
  type SpaceAttention,
  type SpaceArtifactKind,
  type SpaceArtifactStatus,
  type SpaceSynthesisResult,
  type SpaceStatus,
} from '@/entities/space'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { gitApi, useWorkspaceStore } from '@/entities/workspace'
import { Button } from '@/shared/ui/button'
import {
  SpaceWorkboardDialog,
  type SpaceAttemptView,
  type SpaceDraft,
  type SpaceArtifactDraft,
  type SpaceSynthesisPreview,
} from './space-workboard.presentational'
import {
  buildBranchArtifactSuggestions,
  type SpaceArtifactSuggestion,
} from './space-artifact-suggestions.pure'

const emptyDraft: SpaceDraft = {
  title: '',
  status: 'exploring',
  attention: 'none',
  brief: '',
}

const emptyArtifactDraft: SpaceArtifactDraft = {
  kind: 'pull-request',
  label: '',
  value: '',
  status: 'planned',
  sourceSessionId: '',
}

function draftFromSpace(space: Space | null): SpaceDraft {
  if (!space) return emptyDraft
  return {
    title: space.title,
    status: space.status,
    attention: space.attention,
    brief: space.brief,
  }
}

function compactSynthesisPreview(
  preview: SpaceSynthesisPreview,
): SpaceSynthesisPreview | null {
  if (
    preview.brief.trim().length === 0 &&
    preview.decisions.length === 0 &&
    preview.openQuestions.length === 0 &&
    preview.nextAction.trim().length === 0 &&
    preview.artifacts.length === 0
  ) {
    return null
  }
  return preview
}

function formatSynthesisNotes(preview: SpaceSynthesisPreview): string {
  const sections: string[] = []

  if (preview.decisions.length > 0) {
    sections.push(
      ['## Decisions', ...preview.decisions.map((value) => `- ${value}`)].join(
        '\n',
      ),
    )
  }

  if (preview.openQuestions.length > 0) {
    sections.push(
      [
        '## Open questions',
        ...preview.openQuestions.map((value) => `- ${value}`),
      ].join('\n'),
    )
  }

  const nextAction = preview.nextAction.trim()
  if (nextAction.length > 0) {
    sections.push(['## Next action', nextAction].join('\n'))
  }

  return sections.join('\n\n')
}

function appendMarkdownBlock(current: string, block: string): string {
  const currentText = current.trim()
  const blockText = block.trim()
  if (!currentText) return blockText
  if (!blockText) return currentText
  return `${currentText}\n\n${blockText}`
}

export const SpaceWorkboardDialogContainer: FC<{
  trigger?: ReactNode
}> = ({ trigger }) => {
  const open = useDialogStore((s) => s.openDialog === 'space-workboard')
  const payload = useDialogStore((s) => s.payload)
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)
  const spaces = useSpaceStore((s) => s.spaces)
  const attemptsBySpaceId = useSpaceStore((s) => s.attemptsBySpaceId)
  const artifactsBySpaceId = useSpaceStore((s) => s.artifactsBySpaceId)
  const loading = useSpaceStore((s) => s.loading)
  const error = useSpaceStore((s) => s.error)
  const loadSpaces = useSpaceStore((s) => s.loadSpaces)
  const createSpace = useSpaceStore((s) => s.createSpace)
  const updateSpace = useSpaceStore((s) => s.updateSpace)
  const loadAttempts = useSpaceStore((s) => s.loadAttempts)
  const loadArtifacts = useSpaceStore((s) => s.loadArtifacts)
  const updateAttempt = useSpaceStore((s) => s.updateAttempt)
  const setPrimaryAttempt = useSpaceStore((s) => s.setPrimaryAttempt)
  const unlinkAttempt = useSpaceStore((s) => s.unlinkAttempt)
  const addArtifact = useSpaceStore((s) => s.addArtifact)
  const updateArtifact = useSpaceStore((s) => s.updateArtifact)
  const deleteArtifact = useSpaceStore((s) => s.deleteArtifact)
  const synthesize = useSpaceStore((s) => s.synthesize)
  const clearError = useSpaceStore((s) => s.clearError)
  const projects = useProjectStore((s) => s.projects)
  const sessions = useSessionStore((s) => s.globalSessions)
  const workspaces = useWorkspaceStore((s) => s.globalWorkspaces)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createTitle, setCreateTitle] = useState('')
  const [draft, setDraft] = useState<SpaceDraft>(emptyDraft)
  const [artifactDraft, setArtifactDraft] =
    useState<SpaceArtifactDraft>(emptyArtifactDraft)
  const [artifactDialogOpen, setArtifactDialogOpen] = useState(false)
  const [artifactSuggestions, setArtifactSuggestions] = useState<
    SpaceArtifactSuggestion[]
  >([])
  const [synthesisPreview, setSynthesisPreview] =
    useState<SpaceSynthesisPreview | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreatingArtifact, setIsCreatingArtifact] = useState(false)
  const [isDiscoveringArtifacts, setIsDiscoveringArtifacts] = useState(false)
  const [isSynthesizing, setIsSynthesizing] = useState(false)

  const selectedSpace = useMemo(
    () =>
      selectedId
        ? (spaces.find((space) => space.id === selectedId) ?? null)
        : null,
    [spaces, selectedId],
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openDialog('space-workboard')
      else closeDialog()
    },
    [openDialog, closeDialog],
  )

  useEffect(() => {
    if (!open) return
    void loadSpaces()
  }, [open, loadSpaces])

  useEffect(() => {
    if (!open) return
    for (const space of spaces) {
      void loadAttempts(space.id)
      void loadArtifacts(space.id)
    }
  }, [open, spaces, loadAttempts, loadArtifacts])

  useEffect(() => {
    if (!open) return
    if (payload && 'spaceId' in payload) {
      setSelectedId(payload.spaceId)
      return
    }
    if (selectedId && spaces.some((space) => space.id === selectedId)) {
      return
    }
    setSelectedId(spaces[0]?.id ?? null)
  }, [open, spaces, payload, selectedId])

  useEffect(() => {
    setDraft(draftFromSpace(selectedSpace))
    setArtifactDraft(emptyArtifactDraft)
    setArtifactDialogOpen(false)
    setArtifactSuggestions([])
    setSynthesisPreview(null)
  }, [selectedSpace])

  const handleCreate = useCallback(async () => {
    const title = createTitle.trim()
    if (!title) return
    setIsCreating(true)
    const space = await createSpace({ title })
    setIsCreating(false)
    if (!space) return
    setCreateTitle('')
    setSelectedId(space.id)
    setDraft(draftFromSpace(space))
  }, [createSpace, createTitle])

  const handleSave = useCallback(async () => {
    if (!selectedSpace) return
    const title = draft.title.trim()
    if (!title) return
    setIsSaving(true)
    const updated = await updateSpace(selectedSpace.id, {
      title,
      status: draft.status as SpaceStatus,
      attention: draft.attention as SpaceAttention,
      brief: draft.brief,
    })
    setIsSaving(false)
    if (updated) {
      setDraft(draftFromSpace(updated))
    }
  }, [draft, selectedSpace, updateSpace])

  useEffect(() => {
    if (open) clearError()
  }, [open, clearError])

  const attemptCounts = useMemo(
    () =>
      Object.fromEntries(
        spaces.map((space) => [
          space.id,
          attemptsBySpaceId[space.id]?.length ?? 0,
        ]),
      ),
    [attemptsBySpaceId, spaces],
  )
  const artifactCounts = useMemo(
    () =>
      Object.fromEntries(
        spaces.map((space) => [
          space.id,
          artifactsBySpaceId[space.id]?.length ?? 0,
        ]),
      ),
    [spaces, artifactsBySpaceId],
  )

  const selectedAttempts = useMemo<SpaceAttemptView[]>(() => {
    if (!selectedSpace) return []
    return (attemptsBySpaceId[selectedSpace.id] ?? []).map((attempt) => {
      const session =
        sessions.find((entry) => entry.id === attempt.sessionId) ?? null
      const project = session
        ? projects.find((entry) => entry.id === session.projectId)
        : null
      const workspace =
        session?.workspaceId !== null && session?.workspaceId !== undefined
          ? (workspaces.find((entry) => entry.id === session.workspaceId) ??
            null)
          : null

      return {
        attempt,
        sessionName: session?.name ?? 'Unknown session',
        projectName: project?.name ?? 'Unknown project',
        branchName: workspace?.branchName ?? null,
        workingDirectory: session?.workingDirectory ?? null,
        providerId: session?.providerId ?? 'unknown',
        status: session?.status ?? 'unknown',
        attention: session?.attention ?? 'none',
        missing: session === null,
      }
    })
  }, [attemptsBySpaceId, projects, selectedSpace, sessions, workspaces])

  const selectedArtifacts = selectedSpace
    ? (artifactsBySpaceId[selectedSpace.id] ?? [])
    : []

  const handleAttemptRoleChange = useCallback(
    async (attemptId: string, role: SpaceAttemptRole) => {
      if (!selectedSpace) return
      await updateAttempt(attemptId, selectedSpace.id, { role })
    },
    [selectedSpace, updateAttempt],
  )

  const handleSetPrimaryAttempt = useCallback(
    async (attemptId: string) => {
      if (!selectedSpace) return
      await setPrimaryAttempt(selectedSpace.id, attemptId)
    },
    [selectedSpace, setPrimaryAttempt],
  )

  const handleDetachAttempt = useCallback(
    async (attemptId: string) => {
      if (!selectedSpace) return
      await unlinkAttempt(attemptId, selectedSpace.id)
    },
    [selectedSpace, unlinkAttempt],
  )

  const handleCreateArtifact = useCallback(async () => {
    if (!selectedSpace) return
    const label = artifactDraft.label.trim()
    const value = artifactDraft.value.trim()
    if (!label || !value) return

    setIsCreatingArtifact(true)
    const artifact = await addArtifact({
      spaceId: selectedSpace.id,
      kind: artifactDraft.kind,
      label,
      value,
      status: artifactDraft.status,
      sourceSessionId: artifactDraft.sourceSessionId || null,
    })
    setIsCreatingArtifact(false)
    if (artifact) {
      setArtifactDraft(emptyArtifactDraft)
      setArtifactDialogOpen(false)
    }
  }, [addArtifact, artifactDraft, selectedSpace])

  const handleArtifactKindChange = useCallback(
    async (artifactId: string, kind: SpaceArtifactKind) => {
      if (!selectedSpace) return
      await updateArtifact(artifactId, selectedSpace.id, { kind })
    },
    [selectedSpace, updateArtifact],
  )

  const handleArtifactStatusChange = useCallback(
    async (artifactId: string, status: SpaceArtifactStatus) => {
      if (!selectedSpace) return
      await updateArtifact(artifactId, selectedSpace.id, { status })
    },
    [selectedSpace, updateArtifact],
  )

  const handleArtifactSourceSessionChange = useCallback(
    async (artifactId: string, sourceSessionId: string) => {
      if (!selectedSpace) return
      await updateArtifact(artifactId, selectedSpace.id, {
        sourceSessionId: sourceSessionId || null,
      })
    },
    [selectedSpace, updateArtifact],
  )

  const handleArtifactLabelCommit = useCallback(
    async (artifactId: string, label: string) => {
      if (!selectedSpace) return
      await updateArtifact(artifactId, selectedSpace.id, { label })
    },
    [selectedSpace, updateArtifact],
  )

  const handleArtifactValueCommit = useCallback(
    async (artifactId: string, value: string) => {
      if (!selectedSpace) return
      await updateArtifact(artifactId, selectedSpace.id, { value })
    },
    [selectedSpace, updateArtifact],
  )

  const handleDeleteArtifact = useCallback(
    async (artifactId: string) => {
      if (!selectedSpace) return
      await deleteArtifact(artifactId, selectedSpace.id)
    },
    [deleteArtifact, selectedSpace],
  )

  const handleDiscoverArtifacts = useCallback(async () => {
    if (!selectedSpace) return
    setIsDiscoveringArtifacts(true)
    const facts = await Promise.all(
      selectedAttempts.flatMap((attemptView) => {
        if (!attemptView.workingDirectory || attemptView.missing) return []
        return gitApi
          .getBranchOutputFacts(attemptView.workingDirectory)
          .then((fact) => ({
            sourceSessionId: attemptView.attempt.sessionId,
            sourceSessionName: attemptView.sessionName,
            ...fact,
          }))
          .catch(() => null)
      }),
    )
    setArtifactSuggestions(
      buildBranchArtifactSuggestions({
        spaceId: selectedSpace.id,
        facts: facts.filter((fact) => fact !== null),
        existingArtifacts: selectedArtifacts,
      }),
    )
    setIsDiscoveringArtifacts(false)
  }, [selectedAttempts, selectedSpace, selectedArtifacts])

  const handleAcceptArtifactSuggestion = useCallback(
    async (suggestionId: string) => {
      const suggestion = artifactSuggestions.find(
        (candidate) => candidate.id === suggestionId,
      )
      if (!suggestion) return
      const artifact = await addArtifact(suggestion.artifact)
      if (!artifact) return
      setArtifactSuggestions((current) =>
        current.filter((candidate) => candidate.id !== suggestionId),
      )
    },
    [addArtifact, artifactSuggestions],
  )

  const handleDismissArtifactSuggestion = useCallback(
    (suggestionId: string) => {
      setArtifactSuggestions((current) =>
        current.filter((candidate) => candidate.id !== suggestionId),
      )
    },
    [],
  )

  const handleSynthesize = useCallback(async () => {
    if (!selectedSpace) return
    setIsSynthesizing(true)
    const result = await synthesize(
      selectedSpace.id,
      `space:${selectedSpace.id}:${Date.now()}`,
    )
    setIsSynthesizing(false)
    if (!result) return
    setSynthesisPreview(toSynthesisPreview(result))
  }, [selectedSpace, synthesize])

  const handleSynthesisBriefChange = useCallback((value: string) => {
    setSynthesisPreview((current) =>
      current ? { ...current, brief: value } : current,
    )
  }, [])

  const handleAcceptSynthesisBrief = useCallback(() => {
    if (!synthesisPreview) return
    setDraft((current) => ({
      ...current,
      brief: synthesisPreview.brief,
    }))
    setSynthesisPreview((current) =>
      current ? compactSynthesisPreview({ ...current, brief: '' }) : current,
    )
  }, [synthesisPreview])

  const handleRejectSynthesisBrief = useCallback(() => {
    setSynthesisPreview((current) =>
      current ? compactSynthesisPreview({ ...current, brief: '' }) : current,
    )
  }, [])

  const handleAppendSynthesisNotes = useCallback(() => {
    if (!synthesisPreview) return
    const notes = formatSynthesisNotes(synthesisPreview)
    if (!notes.trim()) return

    setDraft((current) => ({
      ...current,
      brief: appendMarkdownBlock(current.brief, notes),
    }))
    setSynthesisPreview((current) =>
      current
        ? compactSynthesisPreview({
            ...current,
            decisions: [],
            openQuestions: [],
            nextAction: '',
          })
        : current,
    )
  }, [synthesisPreview])

  const handleAcceptSynthesisArtifact = useCallback(
    async (suggestionId: string) => {
      if (!selectedSpace || !synthesisPreview) return
      const suggestion = synthesisPreview.artifacts.find(
        (candidate) => candidate.id === suggestionId,
      )
      if (!suggestion) return

      const artifact = await addArtifact({
        spaceId: selectedSpace.id,
        kind: suggestion.kind,
        label: suggestion.label,
        value: suggestion.value,
        status: suggestion.status,
        sourceSessionId: suggestion.sourceSessionId,
      })
      if (!artifact) return

      setSynthesisPreview((current) =>
        current
          ? compactSynthesisPreview({
              ...current,
              artifacts: current.artifacts.filter(
                (candidate) => candidate.id !== suggestionId,
              ),
            })
          : current,
      )
    },
    [addArtifact, selectedSpace, synthesisPreview],
  )

  const handleDismissSynthesisPreview = useCallback(() => {
    setSynthesisPreview(null)
  }, [])

  return (
    <SpaceWorkboardDialog
      open={open}
      trigger={
        trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5" />
              Spaces
            </span>
            <span className="text-[11px] text-muted-foreground/80">Open</span>
          </Button>
        )
      }
      spaces={spaces}
      selectedSpace={selectedSpace}
      selectedDraft={draft}
      selectedAttempts={selectedAttempts}
      selectedArtifacts={selectedArtifacts}
      artifactSuggestions={artifactSuggestions}
      synthesisPreview={synthesisPreview}
      artifactDraft={artifactDraft}
      artifactDialogOpen={artifactDialogOpen}
      createTitle={createTitle}
      attemptCounts={attemptCounts}
      artifactCounts={artifactCounts}
      isLoading={loading}
      isCreating={isCreating}
      isSaving={isSaving}
      isCreatingArtifact={isCreatingArtifact}
      isDiscoveringArtifacts={isDiscoveringArtifacts}
      isSynthesizing={isSynthesizing}
      error={error}
      onOpenChange={handleOpenChange}
      onCreateTitleChange={setCreateTitle}
      onCreate={handleCreate}
      onSelectSpace={setSelectedId}
      onDraftChange={setDraft}
      onSave={handleSave}
      onArtifactDraftChange={setArtifactDraft}
      onArtifactDialogOpenChange={setArtifactDialogOpen}
      onCreateArtifact={handleCreateArtifact}
      onArtifactKindChange={handleArtifactKindChange}
      onArtifactStatusChange={handleArtifactStatusChange}
      onArtifactSourceSessionChange={handleArtifactSourceSessionChange}
      onArtifactLabelCommit={handleArtifactLabelCommit}
      onArtifactValueCommit={handleArtifactValueCommit}
      onDeleteArtifact={handleDeleteArtifact}
      onDiscoverArtifacts={handleDiscoverArtifacts}
      onAcceptArtifactSuggestion={handleAcceptArtifactSuggestion}
      onDismissArtifactSuggestion={handleDismissArtifactSuggestion}
      onSynthesize={handleSynthesize}
      onSynthesisBriefChange={handleSynthesisBriefChange}
      onAcceptSynthesisBrief={handleAcceptSynthesisBrief}
      onRejectSynthesisBrief={handleRejectSynthesisBrief}
      onAppendSynthesisNotes={handleAppendSynthesisNotes}
      onAcceptSynthesisArtifact={handleAcceptSynthesisArtifact}
      onDismissSynthesisPreview={handleDismissSynthesisPreview}
      onAttemptRoleChange={handleAttemptRoleChange}
      onSetPrimaryAttempt={handleSetPrimaryAttempt}
      onDetachAttempt={handleDetachAttempt}
    />
  )
}

function toSynthesisPreview(
  result: SpaceSynthesisResult,
): SpaceSynthesisPreview {
  return {
    brief: result.brief,
    decisions: result.decisions,
    openQuestions: result.openQuestions,
    nextAction: result.nextAction,
    artifacts: result.artifacts.map((artifact, index) => ({
      ...artifact,
      id: [
        'synthesis-artifact',
        artifact.kind,
        artifact.sourceSessionId ?? 'none',
        artifact.value,
        index,
      ].join(':'),
    })),
  }
}
