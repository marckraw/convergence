import { useCallback, useState } from 'react'
import type { FC } from 'react'
import { toast } from 'sonner'
import { useDialogStore } from '@/entities/dialog'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { useWorkspaceStore } from '@/entities/workspace'
import { SessionIntentDialog } from './session-intent-dialog.presentational'

interface SessionIntentDialogContainerProps {
  onBeginCodeSessionDraft?: (workspaceId: string | null) => void
  onSelectCodeSession?: (sessionId: string) => void
}

export const SessionIntentDialogContainer: FC<
  SessionIntentDialogContainerProps
> = ({ onBeginCodeSessionDraft, onSelectCodeSession }) => {
  const open = useDialogStore((s) => s.openDialog === 'session-intent')
  const payload = useDialogStore((s) => s.payload)
  const closeDialog = useDialogStore((s) => s.close)
  const beginSessionDraft = useSessionStore((s) => s.beginSessionDraft)
  const createTerminalSession = useSessionStore((s) => s.createTerminalSession)
  const activeProject = useProjectStore((s) => s.activeProject)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const [creating, setCreating] = useState(false)

  const workspaceId =
    payload && 'workspaceId' in payload ? payload.workspaceId : null

  const handleSelectConversation = useCallback(() => {
    closeDialog()
    if (onBeginCodeSessionDraft) {
      onBeginCodeSessionDraft(workspaceId)
      return
    }
    beginSessionDraft(workspaceId)
  }, [beginSessionDraft, closeDialog, onBeginCodeSessionDraft, workspaceId])

  const handleSelectTerminal = useCallback(async () => {
    if (creating) return
    if (!activeProject) {
      toast.error('No active project. Open a project first.')
      closeDialog()
      return
    }
    const workspace = workspaceId
      ? workspaces.find((w) => w.id === workspaceId)
      : null
    const name = workspace ? `Terminal — ${workspace.branchName}` : 'Terminal'
    setCreating(true)
    try {
      const session = await createTerminalSession(
        activeProject.id,
        workspaceId,
        name,
      )
      closeDialog()
      onSelectCodeSession?.(session.id)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Failed to create terminal session: ${err.message}`
          : 'Failed to create terminal session',
      )
    } finally {
      setCreating(false)
    }
  }, [
    activeProject,
    workspaceId,
    workspaces,
    creating,
    closeDialog,
    createTerminalSession,
    onSelectCodeSession,
  ])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !creating) closeDialog()
    },
    [closeDialog, creating],
  )

  return (
    <SessionIntentDialog
      open={open}
      onOpenChange={handleOpenChange}
      onSelectConversation={handleSelectConversation}
      onSelectTerminal={() => {
        void handleSelectTerminal()
      }}
    />
  )
}
