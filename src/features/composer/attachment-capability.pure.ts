import type { Attachment } from '@/entities/attachment'
import type { ProviderAttachmentCapability } from '@/entities/session'

export interface AttachmentCapabilityError {
  attachmentId: string
  reason: string
}

export interface AttachmentCapabilityResult {
  ok: boolean
  errors: AttachmentCapabilityError[]
  errorByAttachmentId: Record<string, string>
  totalBytes: number
  exceedsTotal: boolean
}

function capabilityRejection(
  attachment: Attachment,
  capability: ProviderAttachmentCapability,
): string | null {
  switch (attachment.kind) {
    case 'image':
      if (!capability.supportsImage) return 'Provider does not accept images'
      if (attachment.sizeBytes > capability.maxImageBytes)
        return `Image exceeds ${capability.maxImageBytes} byte limit`
      return null
    case 'pdf':
      if (!capability.supportsPdf) return 'Provider does not accept PDFs'
      if (attachment.sizeBytes > capability.maxPdfBytes)
        return `PDF exceeds ${capability.maxPdfBytes} byte limit`
      return null
    case 'text':
      if (!capability.supportsText) return 'Provider does not accept text files'
      if (attachment.sizeBytes > capability.maxTextBytes)
        return `Text file exceeds ${capability.maxTextBytes} byte limit`
      return null
  }
}

export function validateAttachmentsAgainstCapability(
  attachments: Attachment[],
  capability: ProviderAttachmentCapability | null | undefined,
): AttachmentCapabilityResult {
  const errors: AttachmentCapabilityError[] = []
  const errorByAttachmentId: Record<string, string> = {}
  let totalBytes = 0

  for (const attachment of attachments) {
    totalBytes += attachment.sizeBytes
    if (!capability) {
      const reason = 'No provider capability available'
      errors.push({ attachmentId: attachment.id, reason })
      errorByAttachmentId[attachment.id] = reason
      continue
    }
    const reason = capabilityRejection(attachment, capability)
    if (reason) {
      errors.push({ attachmentId: attachment.id, reason })
      errorByAttachmentId[attachment.id] = reason
    }
  }

  const exceedsTotal =
    !!capability &&
    totalBytes > capability.maxTotalBytes &&
    attachments.length > 0

  return {
    ok: errors.length === 0 && !exceedsTotal,
    errors,
    errorByAttachmentId,
    totalBytes,
    exceedsTotal,
  }
}
