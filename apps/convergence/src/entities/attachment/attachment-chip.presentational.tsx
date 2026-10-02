import type { FC } from 'react'
import { FileText, FileType, Image as ImageIcon } from 'lucide-react'
import { Button, Chip, Tooltip } from '@convergence/ui'
import type { Attachment } from './attachment.types'

interface AttachmentChipProps {
  attachment: Attachment
  capabilityError?: string | null
  onOpen: (attachment: Attachment) => void
  onRemove?: (attachmentId: string) => void
}

function truncateMiddle(value: string, max = 22): string {
  if (value.length <= max) return value
  const keep = Math.floor((max - 1) / 2)
  return `${value.slice(0, keep)}…${value.slice(-keep)}`
}

/**
 * A file attached to a message (Chip): its name opens the preview, its ✕
 * takes it off. One the provider can't take wears the danger tone, and the
 * tooltip says why (R1, R2).
 */
export const AttachmentChip: FC<AttachmentChipProps> = ({
  attachment,
  capabilityError,
  onOpen,
  onRemove,
}) => {
  const displayName = truncateMiddle(attachment.filename)
  const kind = attachment.kind

  const name = (
    <Tooltip label={capabilityError ?? attachment.filename}>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-label={`Preview ${attachment.filename}`}
        onClick={() => onOpen(attachment)}
        className="max-w-full gap-1.5 px-1 text-xs font-normal"
      >
        {attachment.thumbnailPath ? (
          <img
            src={`file://${attachment.thumbnailPath}`}
            alt=""
            className="size-4 rounded bg-background object-contain"
          />
        ) : kind === 'image' ? (
          <ImageIcon className="size-3.5" />
        ) : kind === 'pdf' ? (
          <FileType className="size-3.5" />
        ) : (
          <FileText className="size-3.5" />
        )}
        <span className="min-w-0 truncate">{displayName}</span>
      </Button>
    </Tooltip>
  )
  const chip = {
    tone: capabilityError ? ('danger' as const) : undefined,
    'data-testid': 'attachment-chip',
    'data-attachment-id': attachment.id,
  }

  return onRemove ? (
    <Chip
      {...chip}
      onRemove={() => onRemove(attachment.id)}
      removeLabel={`Remove ${attachment.filename}`}
    >
      {name}
    </Chip>
  ) : (
    <Chip {...chip}>{name}</Chip>
  )
}
