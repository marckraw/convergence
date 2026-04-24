import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { GitBranch } from 'lucide-react'
import { useDialogStore } from '@/entities/dialog'
import {
  useInitiativeStore,
  type Initiative,
  type InitiativeAttemptRole,
  type InitiativeStatus,
} from '@/entities/initiative'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { useWorkspaceStore } from '@/entities/workspace'
import { Button } from '@/shared/ui/button'
import {
  InitiativeWorkboardDialog,
  type InitiativeAttemptView,
  type InitiativeDraft,
} from './initiative-workboard.presentational'

const emptyDraft: InitiativeDraft = {
  title: '',
  status: 'exploring',
  currentUnderstanding: '',
}

function draftFromInitiative(initiative: Initiative | null): InitiativeDraft {
  if (!initiative) return emptyDraft
  return {
    title: initiative.title,
    status: initiative.status,
    currentUnderstanding: initiative.currentUnderstanding,
  }
}

export const InitiativeWorkboardDialogContainer: FC<{
  trigger?: ReactNode
}> = ({ trigger }) => {
  const open = useDialogStore((s) => s.openDialog === 'initiative-workboard')
  const payload = useDialogStore((s) => s.payload)
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)
  const initiatives = useInitiativeStore((s) => s.initiatives)
  const attemptsByInitiativeId = useInitiativeStore(
    (s) => s.attemptsByInitiativeId,
  )
  const outputsByInitiativeId = useInitiativeStore(
    (s) => s.outputsByInitiativeId,
  )
  const loading = useInitiativeStore((s) => s.loading)
  const error = useInitiativeStore((s) => s.error)
  const loadInitiatives = useInitiativeStore((s) => s.loadInitiatives)
  const createInitiative = useInitiativeStore((s) => s.createInitiative)
  const updateInitiative = useInitiativeStore((s) => s.updateInitiative)
  const loadAttempts = useInitiativeStore((s) => s.loadAttempts)
  const loadOutputs = useInitiativeStore((s) => s.loadOutputs)
  const updateAttempt = useInitiativeStore((s) => s.updateAttempt)
  const setPrimaryAttempt = useInitiativeStore((s) => s.setPrimaryAttempt)
  const unlinkAttempt = useInitiativeStore((s) => s.unlinkAttempt)
  const clearError = useInitiativeStore((s) => s.clearError)
  const projects = useProjectStore((s) => s.projects)
  const sessions = useSessionStore((s) => s.globalSessions)
  const workspaces = useWorkspaceStore((s) => s.globalWorkspaces)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createTitle, setCreateTitle] = useState('')
  const [draft, setDraft] = useState<InitiativeDraft>(emptyDraft)
  const [isCreating, setIsCreating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const selectedInitiative = useMemo(
    () =>
      selectedId
        ? (initiatives.find((initiative) => initiative.id === selectedId) ??
          null)
        : null,
    [initiatives, selectedId],
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openDialog('initiative-workboard')
      else closeDialog()
    },
    [openDialog, closeDialog],
  )

  useEffect(() => {
    if (!open) return
    void loadInitiatives()
  }, [open, loadInitiatives])

  useEffect(() => {
    if (!open) return
    for (const initiative of initiatives) {
      void loadAttempts(initiative.id)
      void loadOutputs(initiative.id)
    }
  }, [open, initiatives, loadAttempts, loadOutputs])

  useEffect(() => {
    if (!open) return
    if (payload && 'initiativeId' in payload) {
      setSelectedId(payload.initiativeId)
      return
    }
    if (
      selectedId &&
      initiatives.some((initiative) => initiative.id === selectedId)
    ) {
      return
    }
    setSelectedId(initiatives[0]?.id ?? null)
  }, [open, initiatives, payload, selectedId])

  useEffect(() => {
    setDraft(draftFromInitiative(selectedInitiative))
  }, [selectedInitiative])

  const handleCreate = useCallback(async () => {
    const title = createTitle.trim()
    if (!title) return
    setIsCreating(true)
    const initiative = await createInitiative({ title })
    setIsCreating(false)
    if (!initiative) return
    setCreateTitle('')
    setSelectedId(initiative.id)
    setDraft(draftFromInitiative(initiative))
  }, [createInitiative, createTitle])

  const handleSave = useCallback(async () => {
    if (!selectedInitiative) return
    const title = draft.title.trim()
    if (!title) return
    setIsSaving(true)
    const updated = await updateInitiative(selectedInitiative.id, {
      title,
      status: draft.status as InitiativeStatus,
      currentUnderstanding: draft.currentUnderstanding,
    })
    setIsSaving(false)
    if (updated) {
      setDraft(draftFromInitiative(updated))
    }
  }, [draft, selectedInitiative, updateInitiative])

  useEffect(() => {
    if (open) clearError()
  }, [open, clearError])

  const attemptCounts = useMemo(
    () =>
      Object.fromEntries(
        initiatives.map((initiative) => [
          initiative.id,
          attemptsByInitiativeId[initiative.id]?.length ?? 0,
        ]),
      ),
    [attemptsByInitiativeId, initiatives],
  )
  const outputCounts = useMemo(
    () =>
      Object.fromEntries(
        initiatives.map((initiative) => [
          initiative.id,
          outputsByInitiativeId[initiative.id]?.length ?? 0,
        ]),
      ),
    [initiatives, outputsByInitiativeId],
  )

  const selectedAttempts = useMemo<InitiativeAttemptView[]>(() => {
    if (!selectedInitiative) return []
    return (attemptsByInitiativeId[selectedInitiative.id] ?? []).map(
      (attempt) => {
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
          providerId: session?.providerId ?? 'unknown',
          status: session?.status ?? 'unknown',
          attention: session?.attention ?? 'none',
          missing: session === null,
        }
      },
    )
  }, [
    attemptsByInitiativeId,
    projects,
    selectedInitiative,
    sessions,
    workspaces,
  ])

  const handleAttemptRoleChange = useCallback(
    async (attemptId: string, role: InitiativeAttemptRole) => {
      if (!selectedInitiative) return
      await updateAttempt(attemptId, selectedInitiative.id, { role })
    },
    [selectedInitiative, updateAttempt],
  )

  const handleSetPrimaryAttempt = useCallback(
    async (attemptId: string) => {
      if (!selectedInitiative) return
      await setPrimaryAttempt(selectedInitiative.id, attemptId)
    },
    [selectedInitiative, setPrimaryAttempt],
  )

  const handleDetachAttempt = useCallback(
    async (attemptId: string) => {
      if (!selectedInitiative) return
      await unlinkAttempt(attemptId, selectedInitiative.id)
    },
    [selectedInitiative, unlinkAttempt],
  )

  return (
    <InitiativeWorkboardDialog
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
              Initiatives
            </span>
            <span className="text-[11px] text-muted-foreground/80">Open</span>
          </Button>
        )
      }
      initiatives={initiatives}
      selectedInitiative={selectedInitiative}
      selectedDraft={draft}
      selectedAttempts={selectedAttempts}
      createTitle={createTitle}
      attemptCounts={attemptCounts}
      outputCounts={outputCounts}
      isLoading={loading}
      isCreating={isCreating}
      isSaving={isSaving}
      error={error}
      onOpenChange={handleOpenChange}
      onCreateTitleChange={setCreateTitle}
      onCreate={handleCreate}
      onSelectInitiative={setSelectedId}
      onDraftChange={setDraft}
      onSave={handleSave}
      onAttemptRoleChange={handleAttemptRoleChange}
      onSetPrimaryAttempt={handleSetPrimaryAttempt}
      onDetachAttempt={handleDetachAttempt}
    />
  )
}
