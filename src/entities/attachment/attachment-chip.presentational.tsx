import type { FC } from 'react'
import { FileText, FileType, Image as ImageIcon, X } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
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

export const AttachmentChip: FC<AttachmentChipProps> = ({
  attachment,
  capabilityError,
  onOpen,
  onRemove,
}) => {
  const hasError = !!capabilityError
  const displayName = truncateMiddle(attachment.filename)
  const kind = attachment.kind

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border bg-muted/40 py-1 pl-1.5 pr-1 text-xs',
        hasError
          ? 'border-destructive text-destructive'
          : 'border-border text-muted-foreground',
      )}
      data-testid="attachment-chip"
      data-attachment-id={attachment.id}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Preview ${attachment.filename}. Press to open preview or Delete to remove.`}
        title={capabilityError ?? attachment.filename}
        onClick={() => onOpen(attachment)}
        className="h-5 gap-1.5 px-1 text-xs font-normal"
      >
        {attachment.thumbnailPath ? (
          <img
            src={`file://${attachment.thumbnailPath}`}
            alt=""
            className="h-4 w-4 rounded object-cover"
          />
        ) : kind === 'image' ? (
          <ImageIcon className="h-3.5 w-3.5" />
        ) : kind === 'pdf' ? (
          <FileType className="h-3.5 w-3.5" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        <span className="max-w-[12rem] truncate">{displayName}</span>
      </Button>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${attachment.filename}`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove(attachment.id)
          }}
          className="h-5 w-5"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </span>
  )
}
