import type { FC } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import type { Attachment } from './attachment.types'

interface AttachmentInlinePreviewProps {
  attachment: Attachment
  onOpen: (attachment: Attachment) => void
}

export const AttachmentInlinePreview: FC<AttachmentInlinePreviewProps> = ({
  attachment,
  onOpen,
}) => {
  if (attachment.kind !== 'image') return null

  const previewPath = attachment.thumbnailPath ?? attachment.storagePath

  return (
    <Button
      type="button"
      variant="ghost"
      className="group h-auto w-full max-w-md flex-col items-stretch justify-start gap-0 whitespace-normal rounded-none p-0 text-left font-normal hover:bg-transparent hover:text-inherit"
      aria-label={`Preview ${attachment.filename}`}
      title={attachment.filename}
      data-testid="attachment-inline-preview"
      data-attachment-id={attachment.id}
      onClick={() => onOpen(attachment)}
    >
      <span className="block aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-black">
        <img
          src={`file://${previewPath}`}
          alt={attachment.filename}
          className="h-full w-full object-contain transition-opacity group-hover:opacity-90"
        />
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{attachment.filename}</span>
      </span>
    </Button>
  )
}
