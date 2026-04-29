import { useState, useCallback } from 'react'
import type { FC } from 'react'
import type { ConversationItem as ConversationItemEntry } from '@/entities/session'
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
  onApprove?: () => void
  onDeny?: () => void
}

const EMPTY_RESOLVED_ATTACHMENTS: Record<string, Attachment> = {}

export const ConversationItem: FC<ConversationItemProps> = ({
  entry,
  sessionId,
  turnStartedAt,
  onApprove,
  onDeny,
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
    resolvedAttachmentsById: resolvedMap,
    actionableApproval: !!onApprove && !!onDeny,
  })

  return (
    <>
      <ConversationItemView
        viewModel={viewModel}
        onApprove={onApprove}
        onDeny={onDeny}
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
