import type { ConversationItem } from '@/entities/session'

/**
 * Every attachment id the transcript's messages reference, as one string.
 *
 * It changes only when a message referencing a new attachment set lands --
 * never on streaming text, a status update or a tool call -- which makes it
 * the trigger for re-reading a session's attachment metadata (MAR-3377 R2).
 */
export function referencedAttachmentIdsKey(
  items: readonly ConversationItem[],
): string {
  const ids: string[] = []
  for (const item of items) {
    if (item.kind !== 'message' || !item.attachmentIds) continue
    for (const id of item.attachmentIds) ids.push(id)
  }
  return ids.join('\n')
}
