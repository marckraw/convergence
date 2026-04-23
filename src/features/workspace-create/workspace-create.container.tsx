import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useDialogStore } from '@/entities/dialog'
import { normalizeProjectSettings, useProjectStore } from '@/entities/project'
import { gitApi, useWorkspaceStore } from '@/entities/workspace'
import type { SearchableSelectItem } from '@/shared/ui/searchable-select.presentational'
import {
  PROJECT_DEFAULT_ID,
  WorkspaceCreateDialog,
} from './workspace-create.presentational'

export const WorkspaceCreateDialogContainer: FC = () => {
  const activeProject = useProjectStore((state) => state.activeProject)
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace)

  const open = useDialogStore((s) => s.openDialog === 'workspace-create')
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)

  const [branchName, setBranchName] = useState('')
  const [selectedBaseBranchId, setSelectedBaseBranchId] =
    useState<string>(PROJECT_DEFAULT_ID)
  const [branches, setBranches] = useState<string[]>([])
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [popoverContainer, setPopoverContainer] =
    useState<HTMLDivElement | null>(null)

  const projectSettings = useMemo(
    () => normalizeProjectSettings(activeProject?.settings),
    [activeProject?.settings],
  )

  const projectDefaultLabel = useMemo(() => {
    const { startStrategy, baseBranchName } = projectSettings.workspaceCreation
    if (startStrategy === 'current-head') return 'Current HEAD'
    return baseBranchName?.trim()
      ? `Project default (${baseBranchName.trim()})`
      : 'Project default (auto-detect)'
  }, [projectSettings])

  useEffect(() => {
    if (!open) return
    setBranchName('')
    setSelectedBaseBranchId(PROJECT_DEFAULT_ID)
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open || !activeProject) return

    let cancelled = false
    setIsLoadingBranches(true)
    gitApi
      .getAllBranches(activeProject.repositoryPath)
      .then((result) => {
        if (cancelled) return
        setBranches(result)
      })
      .catch(() => {
        if (cancelled) return
        setBranches([])
      })
      .finally(() => {
        if (cancelled) return
        setIsLoadingBranches(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, activeProject])

  useEffect(() => {
    if (!activeProject && open) {
      closeDialog()
    }
  }, [activeProject, open, closeDialog])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openDialog('workspace-create')
      else closeDialog()
    },
    [openDialog, closeDialog],
  )

  const baseBranchItems = useMemo<SearchableSelectItem[]>(
    () => [
      {
        id: PROJECT_DEFAULT_ID,
        label: projectDefaultLabel,
        description: 'Uses the strategy from project settings.',
      },
      ...branches.map((name) => ({ id: name, label: name })),
    ],
    [branches, projectDefaultLabel],
  )

  const selectedBaseBranchLabel = useMemo(() => {
    if (selectedBaseBranchId === PROJECT_DEFAULT_ID) return projectDefaultLabel
    return selectedBaseBranchId
  }, [selectedBaseBranchId, projectDefaultLabel])

  const handleSubmit = useCallback(async () => {
    if (!activeProject) return
    const trimmed = branchName.trim()
    if (!trimmed) return

    setIsSubmitting(true)
    setError(null)

    const baseBranch =
      selectedBaseBranchId === PROJECT_DEFAULT_ID ? null : selectedBaseBranchId

    try {
      await createWorkspace(activeProject.id, trimmed, baseBranch)
      const storeError = useWorkspaceStore.getState().error
      if (storeError) {
        setError(storeError)
        return
      }
      closeDialog()
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to create workspace',
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [
    activeProject,
    branchName,
    selectedBaseBranchId,
    createWorkspace,
    closeDialog,
  ])

  if (!activeProject) return null

  return (
    <WorkspaceCreateDialog
      open={open}
      onOpenChange={handleOpenChange}
      projectName={activeProject.name}
      branchName={branchName}
      onBranchNameChange={setBranchName}
      baseBranchItems={baseBranchItems}
      selectedBaseBranchId={selectedBaseBranchId}
      selectedBaseBranchLabel={selectedBaseBranchLabel}
      onBaseBranchChange={setSelectedBaseBranchId}
      isLoadingBranches={isLoadingBranches}
      isSubmitting={isSubmitting}
      error={error}
      popoverContainer={popoverContainer}
      popoverContainerRef={setPopoverContainer}
      onSubmit={() => void handleSubmit()}
    />
  )
}
