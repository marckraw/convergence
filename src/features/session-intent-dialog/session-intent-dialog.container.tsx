import { useCallback, useState } from 'react'
import type { FC } from 'react'
import { useDialogStore } from '@/entities/dialog'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { sessionApi } from '@/entities/session'
import { SessionIntentDialog } from './session-intent-dialog.presentational'

export const SessionIntentDialogContainer: FC = () => {
  const open = useDialogStore((s) => s.openDialog === 'session-intent')
  const payload = useDialogStore((s) => s.payload)
  const closeDialog = useDialogStore((s) => s.close)
  const beginSessionDraft = useSessionStore((s) => s.beginSessionDraft)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const activeProject = useProjectStore((s) => s.activeProject)
  const [creating, setCreating] = useState(false)

  const workspaceId =
    payload && 'workspaceId' in payload ? payload.workspaceId : null

  const handleSelectConversation = useCallback(() => {
    closeDialog()
    beginSessionDraft(workspaceId)
  }, [closeDialog, beginSessionDraft, workspaceId])

  const handleSelectTerminal = useCallback(async () => {
    if (creating) return
    if (!activeProject) {
      closeDialog()
      return
    }
    setCreating(true)
    try {
      const session = await sessionApi.create({
        projectId: activeProject.id,
        workspaceId,
        providerId: 'shell',
        model: null,
        effort: null,
        name: 'Terminal',
        primarySurface: 'terminal',
      })
      setActiveSession(session.id)
    } finally {
      setCreating(false)
      closeDialog()
    }
  }, [activeProject, workspaceId, creating, closeDialog, setActiveSession])

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
