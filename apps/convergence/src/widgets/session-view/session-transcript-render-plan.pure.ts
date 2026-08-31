import type { ConversationItem } from '@/entities/session'

export interface ConversationRenderEntry {
  item: ConversationItem
  injectedContextText: string | null
  turnBoundary: boolean
  turnSequence: number | null
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
  const seenTurnIds = new Set<string>()
  let previousRenderedTurnId: string | null = null
  let turnCount = 0

  const pushEntry = (
    item: ConversationItem,
    injectedContextText: string | null,
  ) => {
    const turnBoundary =
      item.turnId !== null && previousRenderedTurnId !== item.turnId
    let turnSequence: number | null = null

    if (turnBoundary && item.turnId) {
      if (!seenTurnIds.has(item.turnId)) {
        seenTurnIds.add(item.turnId)
        turnCount += 1
      }
      turnSequence = turnCount
    }

    previousRenderedTurnId = item.turnId
    entries.push({
      item,
      injectedContextText,
      turnBoundary,
      turnSequence,
    })
  }

  for (const item of items) {
    if (isBootContextNote(item)) {
      pendingBootContext.push(item)
      continue
    }

    if (isUserMessage(item) && pendingBootContext.length > 0) {
      pushEntry(
        item,
        pendingBootContext.map((entry) => entry.text).join('\n\n'),
      )
      pendingBootContext.length = 0
      continue
    }

    pushEntry(item, null)
  }

  for (const item of pendingBootContext) {
    pushEntry(item, null)
  }

  return entries
}
