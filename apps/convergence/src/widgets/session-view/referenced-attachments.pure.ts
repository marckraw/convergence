import type { ConversationItem } from '@/entities/session'

/**
 * Every attachment id the transcript references, as one string: a message's
 * files and the images a tool result produced (MAR-4274).
 *
 * It changes only when an item referencing a new attachment set lands, or a
 * tool result gains its images -- never on streaming text, a status update or
 * a tool call -- which makes it the trigger for re-reading a session's
 * attachment metadata (MAR-3377 R2).
 */
export function referencedAttachmentIdsKey(
  items: readonly ConversationItem[],
): string {
  const ids: string[] = []
  for (const item of items) {
    if (item.kind !== 'message' && item.kind !== 'tool-result') continue
    if (!item.attachmentIds) continue
    for (const id of item.attachmentIds) ids.push(id)
  }
  return ids.join('\n')
}
