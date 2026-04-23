import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useDialogStore } from '@/entities/dialog'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { useWorkspaceStore } from '@/entities/workspace'
import { sessionApi } from '@/entities/session'
import {
  TerminalSessionCreateDialog,
  type WorkspaceOption,
} from './terminal-session-create.presentational'

export const TerminalSessionCreateDialogContainer: FC = () => {
  const open = useDialogStore(
    (s) => s.openDialog === 'terminal-session-create',
  )
  const payload = useDialogStore((s) => s.payload)
  const closeDialog = useDialogStore((s) => s.close)

  const activeProject = useProjectStore((s) => s.activeProject)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  const payloadWorkspaceId =
    payload && 'workspaceId' in payload ? payload.workspaceId : null

  const [name, setName] = useState('Terminal')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    payloadWorkspaceId,
  )
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('Terminal')
    setSelectedWorkspaceId(payloadWorkspaceId)
    setSubmitError(null)
    setNameError(null)
    setSubmitting(false)
  }, [open, payloadWorkspaceId])

  const workspaceOptions = useMemo<WorkspaceOption[]>(() => {
    const rootLabel = activeProject
      ? `Project root (${activeProject.name})`
      : 'Project root'
    return [
      { id: null, label: rootLabel },
      ...workspaces.map((workspace) => ({
        id: workspace.id,
        label: workspace.branchName,
      })),
    ]
  }, [activeProject, workspaces])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !submitting) closeDialog()
    },
    [closeDialog, submitting],
  )

  const handleSubmit = useCallback(async () => {
    if (!activeProject) {
      setSubmitError('No active project')
      return
    }
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Name is required')
      return
    }
    if (trimmed.length > 120) {
      setNameError('Name must be 120 characters or fewer')
      return
    }
    setNameError(null)
    setSubmitting(true)
    setSubmitError(null)
    try {
      const session = await sessionApi.create({
        projectId: activeProject.id,
        workspaceId: selectedWorkspaceId,
        providerId: 'shell',
        model: null,
        effort: null,
        name: trimmed,
        primarySurface: 'terminal',
      })
      setActiveSession(session.id)
      closeDialog()
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to create terminal session',
      )
    } finally {
      setSubmitting(false)
    }
  }, [activeProject, name, selectedWorkspaceId, setActiveSession, closeDialog])

  return (
    <TerminalSessionCreateDialog
      open={open}
      onOpenChange={handleOpenChange}
      name={name}
      onNameChange={setName}
      workspaces={workspaceOptions}
      selectedWorkspaceId={selectedWorkspaceId}
      onSelectWorkspace={setSelectedWorkspaceId}
      nameError={nameError}
      submitError={submitError}
      submitting={submitting}
      onCancel={() => {
        if (!submitting) closeDialog()
      }}
      onSubmit={() => {
        void handleSubmit()
      }}
    />
  )
}
