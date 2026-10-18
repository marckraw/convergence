import {
  EXECUTION_TOOL_ATTACHMENT_MAX_BYTES,
  EXECUTION_TOOL_ATTACHMENTS_MAX_COUNT,
  type ExecutionToolAttachment,
} from '@mrck-labs/execution-host-protocol'
import type {
  ToolAttachmentOmissionCode,
  ToolAttachmentOmissions,
} from '../../session/conversation-item.types'

/** One tool image to download, and the most bytes its body may be. */
export interface ToolImageDownload {
  attachment: ExecutionToolAttachment
  maxBytes: number
}

export interface ToolImageDownloadPlan {
  downloads: ToolImageDownload[]
  /** The references not worth a request, by the reason they are not. */
  omissions: ToolAttachmentOmissions
}

/**
 * Which of a tool result's image references a remote run downloads
 * (MAR-4274), decided from the references alone so nothing is fetched that
 * could not be shown.
 *
 * The protocol's own limits hold: at most `EXECUTION_TOOL_ATTACHMENTS_MAX_COUNT`
 * per result, each at most `EXECUTION_TOOL_ATTACHMENT_MAX_BYTES`. A host
 * persisted each image before it named it and never changes the reference, so
 * its `sizeBytes` is the body's ceiling: a body longer than the reference said
 * is refused mid-read, not stored. A reference that is not an image, or has
 * no size, is not asked for.
 */
export function planToolImageDownloads(
  attachments: readonly ExecutionToolAttachment[],
): ToolImageDownloadPlan {
  const downloads: ToolImageDownload[] = []
  const omissions: ToolAttachmentOmissions = {}
  const omit = (code: ToolAttachmentOmissionCode) => {
    omissions[code] = (omissions[code] ?? 0) + 1
  }

  for (const attachment of attachments) {
    const { sizeBytes, mimeType } = attachment
    if (downloads.length >= EXECUTION_TOOL_ATTACHMENTS_MAX_COUNT)
      omit('turn-limit')
    else if (!mimeType.toLowerCase().startsWith('image/'))
      omit('unsupported-mime-type')
    else if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1)
      omit('invalid-image')
    else if (sizeBytes > EXECUTION_TOOL_ATTACHMENT_MAX_BYTES)
      omit('image-too-large')
    else downloads.push({ attachment, maxBytes: sizeBytes })
  }

  return { downloads, omissions }
}
