import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { toast } from 'sonner'
import { useDialogStore } from '@/entities/dialog'
import {
  laneApi,
  laneBaseBranchLabel,
  normalizeProjectSettings,
  useProjectStore,
  type LaneCreateProgressPhase,
} from '@/entities/project'
import {
  LaneCreateDialog,
  type LaneCreateStage,
} from './lane-create.presentational'

/**
 * The door a lane is made through (MAR-2783, slice L1). Always for the active
 * project's ROOT: a lane is made from a root, so opening this from inside a
 * lane makes a sibling, not a lane of a lane.
 */
export const LaneCreateDialogContainer: FC = () => {
  const activeProject = useProjectStore((state) => state.activeProject)
  const projects = useProjectStore((state) => state.projects)
  const createLane = useProjectStore((state) => state.createLane)
  const setActiveProject = useProjectStore((state) => state.setActiveProject)

  const open = useDialogStore((s) => s.openDialog === 'lane-create')
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)

  const root = useMemo(() => {
    if (!activeProject) return null
    if (activeProject.laneOf === null) return activeProject
    return (
      projects.find((project) => project.id === activeProject.laneOf) ?? null
    )
  }, [activeProject, projects])

  const [laneName, setLaneName] = useState('')
  const [branchName, setBranchName] = useState('')
  const [stage, setStage] = useState<LaneCreateStage>({ kind: 'form' })
  const [createdLaneId, setCreatedLaneId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // L5: the label reads what the service will do, and nothing else.
  const baseBranchLabel = useMemo(
    () => laneBaseBranchLabel(normalizeProjectSettings(root?.settings)),
    [root?.settings],
  )

  useEffect(() => {
    if (!open) return
    setLaneName('')
    setBranchName('')
    setStage({ kind: 'form' })
    setCreatedLaneId(null)
    setError(null)
  }, [open])

  useEffect(() => {
    if (open && !root) closeDialog()
  }, [open, root, closeDialog])

  // Progress rides a broadcast rather than the invoke's return, because the
  // invoke returns once, at the end, and the door wants to say "copying"
  // while the copy runs.
  useEffect(() => {
    if (!open || !root) return
    return laneApi.onProgress((progress) => {
      if (progress.rootProjectId !== root.id) return
      if (progress.laneName !== laneName.trim()) return
      const phase: LaneCreateProgressPhase = progress.phase
      setStage((current) =>
        current.kind === 'working' ? { kind: 'working', phase } : current,
      )
    })
  }, [open, root, laneName])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openDialog('lane-create')
      else closeDialog()
    },
    [openDialog, closeDialog],
  )

  const handleSubmit = useCallback(async () => {
    if (!root) return
    setError(null)
    setStage({ kind: 'working', phase: null })
    try {
      const result = await createLane({
        rootProjectId: root.id,
        laneName: laneName.trim(),
        branchName: branchName.trim(),
      })
      setCreatedLaneId(result.lane.id)
      setStage({
        kind: 'done',
        lanePath: result.lane.repositoryPath,
        copyMethod: result.copyMethod,
        warnings: result.warnings,
      })
    } catch (nextError) {
      setStage({ kind: 'form' })
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to create lane',
      )
    }
  }, [root, laneName, branchName, createLane])

  const handleSwitchToLane = useCallback(async () => {
    if (!createdLaneId) return
    await setActiveProject(createdLaneId)
    toast.success(`Switched to lane ${laneName.trim()}`)
    closeDialog()
  }, [createdLaneId, laneName, setActiveProject, closeDialog])

  if (!root) return null

  return (
    <LaneCreateDialog
      open={open}
      onOpenChange={handleOpenChange}
      rootName={root.name}
      baseBranchLabel={baseBranchLabel}
      laneName={laneName}
      onLaneNameChange={setLaneName}
      branchName={branchName}
      onBranchNameChange={setBranchName}
      stage={stage}
      error={error}
      onSubmit={() => void handleSubmit()}
      onSwitchToLane={() => void handleSwitchToLane()}
    />
  )
}
