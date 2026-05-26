import { useState, useCallback } from 'react'
import type { FC } from 'react'
import type { ConversationItem as ConversationItemEntry } from '@/entities/session'
import type { InteractionResponse } from '@/entities/session'
import {
  AttachmentPreviewContainer,
  useAttachmentStore,
  type Attachment,
} from '@/entities/attachment'
import { ConversationItemView } from './transcript-entry.presentational'
import { buildTranscriptEntryViewModel } from './transcript-entry.pure'

interface ConversationItemProps {
  entry: ConversationItemEntry
  sessionId: string
  turnStartedAt?: string | null
  injectedContextText?: string | null
  onApprove?: () => void
  onDeny?: () => void
  onInputAnswer?: (response: InteractionResponse, displayText: string) => void
}

const EMPTY_RESOLVED_ATTACHMENTS: Record<string, Attachment> = {}

export const ConversationItem: FC<ConversationItemProps> = ({
  entry,
  sessionId,
  turnStartedAt,
  injectedContextText = null,
  onApprove,
  onDeny,
  onInputAnswer,
}) => {
  const resolvedMap = useAttachmentStore(
    (state) => state.resolved[sessionId] ?? EMPTY_RESOLVED_ATTACHMENTS,
  )
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(
    null,
  )

  const handleClosePreview = useCallback(() => {
    setPreviewAttachment(null)
  }, [])

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
        onDeny={onDeny}
        onInputAnswer={onInputAnswer}
        onAttachmentOpen={setPreviewAttachment}
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
