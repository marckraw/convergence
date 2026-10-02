import type { AttachmentIngestRejection } from '@/entities/attachment'

/**
 * The headline over the files the composer couldn't take, in R10's words:
 * "Couldn't attach notes.pdf." for one, "Couldn't attach 3 files." for more,
 * each file's reason listed under it (CONV-7, DS-5).
 */
export function attachmentRejectionsTitle(
  rejections: readonly AttachmentIngestRejection[],
): string {
  const [only] = rejections
  if (rejections.length === 1 && only)
    return `Couldn’t attach ${only.filename}.`
  return `Couldn’t attach ${rejections.length} files.`
}
