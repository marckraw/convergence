import { memo, useState, useCallback } from 'react'
import type { FC } from 'react'
import {
  useLiveConversationItem,
  type ConversationItem as ConversationItemEntry,
  type InteractionResponse,
} from '@/entities/session'
import {
  AttachmentPreviewContainer,
  useAttachmentStore,
  type Attachment,
} from '@/entities/attachment'
import { useDialogStore } from '@/entities/dialog'
import { ConversationItemView } from './transcript-entry.presentational'
import { buildTranscriptEntryViewModel } from './transcript-entry.pure'

interface ConversationItemProps {
  entry: ConversationItemEntry
  sessionId: string
  turnStartedAt?: string | null
  injectedContextText?: string | null
  onApprove?: () => void
  onApproveSession?: () => void
  onDeny?: () => void
  onInputAnswer?: (response: InteractionResponse, displayText: string) => void
}

const EMPTY_RESOLVED_ATTACHMENTS: Record<string, Attachment> = {}

const ConversationItemContent: FC<ConversationItemProps> = ({
  entry: listEntry,
  sessionId,
  turnStartedAt,
  injectedContextText = null,
  onApprove,
  onApproveSession,
  onDeny,
  onInputAnswer,
}) => {
  // MAR-3310 F1e R1: a growing reply's text lives beside the list, and only
  // this row reads it.
  const entry = useLiveConversationItem(listEntry)
  const resolvedMap = useAttachmentStore(
    (state) => state.resolved[sessionId] ?? EMPTY_RESOLVED_ATTACHMENTS,
  )
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(
    null,
  )

  const handleClosePreview = useCallback(() => {
    setPreviewAttachment(null)
  }, [])

  const openDialog = useDialogStore((state) => state.open)

  /**
   * Sends the user to the one place connectors are authorized (PA11), rather
   * than growing a second authorization entry point in the transcript. The
   * note already says which server and which account.
   */
  const handleNoteAction = useCallback(() => {
    openDialog('app-settings', { appSettingsSection: 'provider-accounts' })
  }, [openDialog])

  const viewModel = buildTranscriptEntryViewModel({
    item: entry,
    turnStartedAt,
    injectedContextText,
    resolvedAttachmentsById: resolvedMap,
    actionableApproval: !!onApprove && !!onDeny,
    actionableInput: !!onInputAnswer,
  })

  return (
    <>
      <ConversationItemView
        viewModel={viewModel}
        onApprove={onApprove}
        onApproveSession={onApproveSession}
        onDeny={onDeny}
        onInputAnswer={onInputAnswer}
        onAttachmentOpen={setPreviewAttachment}
        onNoteAction={handleNoteAction}
      />
      {previewAttachment && (
        <AttachmentPreviewContainer
          attachment={previewAttachment}
          onClose={handleClosePreview}
        />
      )}
    </>
  )
}

/**
 * A memo boundary per row (MAR-3310 F1e R3): the transcript redraws when a
 * row measures taller, and a row whose item and handlers did not change does
 * not redraw with it. Handlers must therefore be stable per item.
 */
export const ConversationItem = memo(ConversationItemContent)
