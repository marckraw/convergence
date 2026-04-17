import type { FC } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import type { Attachment } from '@/entities/attachment'

interface AttachmentPreviewProps {
  attachment: Attachment | null
  objectUrl: string | null
  textContent: string | null
  isLoading: boolean
  error: string | null
  onClose: () => void
}

export const AttachmentPreview: FC<AttachmentPreviewProps> = ({
  attachment,
  objectUrl,
  textContent,
  isLoading,
  error,
  onClose,
}) => {
  const open = attachment !== null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate">
            {attachment?.filename ?? 'Preview'}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {!isLoading && error && (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">
            {error}
          </div>
        )}

        {!isLoading && !error && attachment?.kind === 'image' && objectUrl && (
          <img
            src={objectUrl}
            alt={attachment.filename}
            className="mx-auto max-h-[80vh] object-contain bg-black"
          />
        )}

        {!isLoading && !error && attachment?.kind === 'pdf' && objectUrl && (
          <embed
            src={objectUrl}
            type="application/pdf"
            className="h-[80vh] w-full"
          />
        )}

        {!isLoading && !error && attachment?.kind === 'text' && (
          <pre className="max-h-[80vh] overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 font-mono text-xs text-foreground">
            {textContent ?? ''}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  )
}
