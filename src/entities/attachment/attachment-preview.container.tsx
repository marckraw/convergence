import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { attachmentApi } from './attachment.api'
import type { Attachment } from './attachment.types'
import { AttachmentPreview } from './attachment-preview.presentational'

interface AttachmentPreviewContainerProps {
  attachment: Attachment | null
  onClose: () => void
}

function mimeForKind(attachment: Attachment): string {
  return attachment.mimeType || 'application/octet-stream'
}

export const AttachmentPreviewContainer: FC<
  AttachmentPreviewContainerProps
> = ({ attachment, onClose }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!attachment) {
      setObjectUrl(null)
      setTextContent(null)
      setError(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    let createdUrl: string | null = null
    setIsLoading(true)
    setError(null)
    setObjectUrl(null)
    setTextContent(null)

    attachmentApi
      .readBytes(attachment.id)
      .then((bytes) => {
        if (cancelled) return
        if (attachment.kind === 'text') {
          const decoder = new TextDecoder('utf-8')
          setTextContent(decoder.decode(bytes))
        } else {
          const blob = new Blob([new Uint8Array(bytes)], {
            type: mimeForKind(attachment),
          })
          createdUrl = URL.createObjectURL(blob)
          setObjectUrl(createdUrl)
        }
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setIsLoading(false)
        setError(err instanceof Error ? err.message : 'Failed to load preview')
      })

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [attachment])

  return (
    <AttachmentPreview
      attachment={attachment}
      objectUrl={objectUrl}
      textContent={textContent}
      isLoading={isLoading}
      error={error}
      onClose={onClose}
    />
  )
}
