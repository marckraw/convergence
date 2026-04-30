import type { ConversationItem } from '@/entities/session'

export interface ConversationRenderEntry {
  item: ConversationItem
  injectedContextText: string | null
}

type NoteConversationItem = Extract<ConversationItem, { kind: 'note' }>

function isBootContextNote(
  item: ConversationItem,
): item is NoteConversationItem {
  return (
    item.kind === 'note' &&
    item.providerMeta.providerEventType === 'context.boot'
  )
}

function isUserMessage(
  item: ConversationItem,
): item is Extract<ConversationItem, { kind: 'message'; actor: 'user' }> {
  return item.kind === 'message' && item.actor === 'user'
}

export function buildConversationRenderPlan(
  items: ConversationItem[],
): ConversationRenderEntry[] {
  const entries: ConversationRenderEntry[] = []
  const pendingBootContext: NoteConversationItem[] = []

  for (const item of items) {
    if (isBootContextNote(item)) {
      pendingBootContext.push(item)
      continue
    }

    if (isUserMessage(item) && pendingBootContext.length > 0) {
      entries.push({
        item,
        injectedContextText: pendingBootContext
          .map((entry) => entry.text)
          .join('\n\n'),
      })
      pendingBootContext.length = 0
      continue
    }

    entries.push({ item, injectedContextText: null })
  }

  for (const item of pendingBootContext) {
    entries.push({ item, injectedContextText: null })
  }

  return entries
}
