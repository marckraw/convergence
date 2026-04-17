import type { FC } from 'react'
import type { Attachment } from '@/entities/attachment'
import { AttachmentChip } from './attachment-chip.presentational'

interface AttachmentsRowProps {
  attachments: Attachment[]
  errorByAttachmentId: Record<string, string>
  onOpen: (attachment: Attachment) => void
  onRemove: (attachmentId: string) => void
}

export const AttachmentsRow: FC<AttachmentsRowProps> = ({
  attachments,
  errorByAttachmentId,
  onOpen,
  onRemove,
}) => {
  if (attachments.length === 0) return null

  return (
    <div className="mb-2 flex flex-wrap gap-1.5" data-testid="attachments-row">
      {attachments.map((attachment) => (
        <AttachmentChip
          key={attachment.id}
          attachment={attachment}
          capabilityError={errorByAttachmentId[attachment.id] ?? null}
          onOpen={onOpen}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}
