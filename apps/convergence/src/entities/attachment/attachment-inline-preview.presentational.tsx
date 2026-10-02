import type { FC } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { Button, Tooltip } from '@convergence/ui'
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
    <Tooltip label={attachment.filename}>
      {/* A link Button: the picture and its name act, with no control box to undo. */}
      <Button
        type="button"
        variant="link"
        aria-label={`Preview ${attachment.filename}`}
        data-testid="attachment-inline-preview"
        data-attachment-id={attachment.id}
        onClick={() => onOpen(attachment)}
        className="group w-full max-w-md flex-col items-stretch justify-start gap-0 whitespace-normal rounded-none text-left font-normal text-inherit hover:no-underline"
      >
        <span className="block aspect-[4/3] w-full overflow-hidden rounded-md border border-line bg-viewer">
          {/* The button's name and the line under the picture name it already. */}
          <img
            src={`file://${previewPath}`}
            alt=""
            className="h-full w-full object-contain transition-opacity group-hover:opacity-90"
          />
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{attachment.filename}</span>
        </span>
      </Button>
    </Tooltip>
  )
}
