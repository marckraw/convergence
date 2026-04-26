import { useState, useCallback } from 'react'
import type { FC } from 'react'
import type { ConversationItem as ConversationItemEntry } from '@/entities/session'
import {
  AttachmentPreviewContainer,
  useAttachmentStore,
  type Attachment,
} from '@/entities/attachment'
import { ConversationItemView } from './transcript-entry.presentational'

interface ConversationItemProps {
  entry: ConversationItemEntry
  sessionId: string
  onApprove?: () => void
  onDeny?: () => void
}

const EMPTY_RESOLVED_ATTACHMENTS: Record<string, Attachment> = {}

export const ConversationItem: FC<ConversationItemProps> = ({
  entry,
  sessionId,
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

  const isUserMessage =
    entry.kind === 'message' && 'actor' in entry && entry.actor === 'user'

  const attachmentIds: string[] | undefined = isUserMessage
    ? (entry as { attachmentIds?: string[] }).attachmentIds
    : undefined

  const resolved: Attachment[] = []
  const missing: string[] = []

  if (attachmentIds) {
    for (const id of attachmentIds) {
      const att = resolvedMap[id]
      if (att) {
        resolved.push(att)
      } else {
        missing.push(id)
      }
    }
  }

  return (
    <>
      <ConversationItemView
        entry={entry}
        onApprove={onApprove}
        onDeny={onDeny}
        attachments={resolved.length > 0 ? resolved : undefined}
        missingAttachmentIds={missing.length > 0 ? missing : undefined}
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
