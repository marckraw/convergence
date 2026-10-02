import type { FC } from 'react'
import {
  CodeBlock,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
} from '@convergence/ui'
import type { Attachment } from './attachment.types'

interface AttachmentPreviewProps {
  attachment: Attachment | null
  objectUrl: string | null
  textContent: string | null
  isLoading: boolean
  error: string | null
  onClose: () => void
}

/**
 * A file attached to a message, whole, in the widest dialog (up to 1280 px)
 * as tall as the window allows: a picture letterboxed on the viewer's black,
 * a PDF, or the text. While it is read it says so; a file that can't be read
 * says why, as an alert.
 */
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
      <DialogContent size="2xl" className="max-h-full">
        <DialogHeader>
          <DialogTitle className="truncate">
            {attachment?.filename ?? 'Preview'}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {isLoading && (
            <div className="flex h-64">
              <EmptyState
                state="loading"
                variant="plain"
                layout="centred"
                title="Loading…"
              />
            </div>
          )}

          {!isLoading && error && (
            <div className="flex h-64">
              <EmptyState
                state="failed"
                variant="plain"
                layout="centred"
                title="Couldn't open the preview"
                detail={error}
              />
            </div>
          )}

          {!isLoading &&
            !error &&
            attachment?.kind === 'image' &&
            objectUrl && (
              <div className="flex min-h-64 items-center justify-center rounded-md bg-viewer">
                <img
                  src={objectUrl}
                  alt={attachment.filename}
                  className="block h-auto max-h-(--layout-preview-height) w-auto max-w-full object-contain"
                />
              </div>
            )}

          {!isLoading && !error && attachment?.kind === 'pdf' && objectUrl && (
            <embed
              src={objectUrl}
              type="application/pdf"
              className="h-(--layout-preview-height) min-h-64 w-full"
            />
          )}

          {!isLoading && !error && attachment?.kind === 'text' && (
            // The file's text: CodeBlock, wrapping, as tall as it is; the
            // preview's own pane scrolls it (CONV-32).
            <CodeBlock label="Text preview" maxHeight="none" wrap>
              {textContent ?? ''}
            </CodeBlock>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
