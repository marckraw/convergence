import type { FC } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import type { Attachment } from './attachment.types'

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
      <DialogContent className="w-[min(96vw,72rem)] max-h-[calc(100vh-2rem)] max-w-none p-0">
        <DialogHeader className="border-b border-border px-4 py-3 pr-10">
          <DialogTitle className="truncate">
            {attachment?.filename ?? 'Preview'}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto p-4">
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

          {!isLoading &&
            !error &&
            attachment?.kind === 'image' &&
            objectUrl && (
              <div className="flex min-h-64 items-center justify-center rounded-md bg-black">
                <img
                  src={objectUrl}
                  alt={attachment.filename}
                  className="block h-auto w-auto max-h-[calc(100vh-8rem)] max-w-full object-contain"
                />
              </div>
            )}

          {!isLoading && !error && attachment?.kind === 'pdf' && objectUrl && (
            <embed
              src={objectUrl}
              type="application/pdf"
              className="h-[calc(100vh-8rem)] min-h-64 w-full"
            />
          )}

          {!isLoading && !error && attachment?.kind === 'text' && (
            <pre className="max-h-[calc(100vh-8rem)] overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 font-mono text-xs text-foreground">
              {textContent ?? ''}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
