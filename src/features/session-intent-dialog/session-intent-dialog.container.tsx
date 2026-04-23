import { useCallback } from 'react'
import type { FC } from 'react'
import { useDialogStore } from '@/entities/dialog'
import { useSessionStore } from '@/entities/session'
import { SessionIntentDialog } from './session-intent-dialog.presentational'

export const SessionIntentDialogContainer: FC = () => {
  const open = useDialogStore((s) => s.openDialog === 'session-intent')
  const payload = useDialogStore((s) => s.payload)
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)
  const beginSessionDraft = useSessionStore((s) => s.beginSessionDraft)

  const workspaceId =
    payload && 'workspaceId' in payload ? payload.workspaceId : null

  const handleSelectConversation = useCallback(() => {
    closeDialog()
    beginSessionDraft(workspaceId)
  }, [closeDialog, beginSessionDraft, workspaceId])

  const handleSelectTerminal = useCallback(() => {
    openDialog('terminal-session-create', { workspaceId })
  }, [openDialog, workspaceId])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) closeDialog()
    },
    [closeDialog],
  )

  return (
    <SessionIntentDialog
      open={open}
      onOpenChange={handleOpenChange}
      onSelectConversation={handleSelectConversation}
      onSelectTerminal={handleSelectTerminal}
    />
  )
}
