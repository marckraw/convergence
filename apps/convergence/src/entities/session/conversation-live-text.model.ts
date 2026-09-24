import { useCallback, useSyncExternalStore } from 'react'
import type { ConversationItem } from './session.types'

type StreamingItem = Extract<ConversationItem, { kind: 'message' | 'thinking' }>

interface LiveText {
  sessionId: string
  /** The list's own object this text grew on; any other object ignores it. */
  base: StreamingItem
  item: StreamingItem
}

const liveTexts = new Map<string, LiveText>()
const listeners = new Map<string, Set<() => void>>()

function notify(itemId: string) {
  for (const listener of listeners.get(itemId) ?? []) listener()
}

function subscribeLiveItem(itemId: string, listener: () => void) {
  let bucket = listeners.get(itemId)
  if (!bucket) {
    bucket = new Set()
    listeners.set(itemId, bucket)
  }
  const set = bucket
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(itemId)
  }
}

/**
 * External store (observer) for the text of a reply that is still growing
 * (MAR-3310 F1e).
 *
 * A streaming append changes one row, so its text lives here, keyed by item
 * id, rather than in the conversation's item array: the array keeps its
 * identity and nothing that walks it redoes O(n) work per token. The row
 * subscribes through `useLiveConversationItem`. Elapsed subscribes to
 * `updatedAt` only, through `useLiveConversationUpdatedAt`.
 *
 * Every entry is bound to the array object it grew on. When a full patch or a
 * snapshot replaces that object, the entry no longer applies, even before it
 * is dropped: a reader never pairs new facts with old text.
 */
export function liveConversationItem<T extends ConversationItem>(item: T): T {
  const live = liveTexts.get(item.id)
  return live && live.base === item ? (live.item as T) : item
}

export function appendLiveConversationText(
  sessionId: string,
  base: StreamingItem,
  append: string,
  updatedAt: string,
) {
  const current = liveConversationItem(base)
  liveTexts.set(base.id, {
    sessionId,
    base,
    item: { ...current, text: current.text + append, updatedAt },
  })
  notify(base.id)
}

export function dropLiveConversationText(itemId: string) {
  if (liveTexts.delete(itemId)) notify(itemId)
}

export function dropSessionLiveConversationText(sessionId: string) {
  for (const [itemId, live] of liveTexts) {
    if (live.sessionId !== sessionId) continue
    liveTexts.delete(itemId)
    notify(itemId)
  }
}

export function resetLiveConversationTextForTests() {
  liveTexts.clear()
}

/**
 * One subscription to a streaming item's live `updatedAt` (MAR-3310 F1g).
 * A null item registers no listener: a quiet conversation pays nothing.
 */
export function useLiveConversationUpdatedAt(
  item: ConversationItem | null,
): string | null {
  const itemId = item?.id ?? null
  const subscribe = useCallback(
    (listener: () => void) => {
      if (itemId === null) return () => {}
      return subscribeLiveItem(itemId, listener)
    },
    [itemId],
  )
  const read = useCallback(
    () => (item === null ? null : liveConversationItem(item).updatedAt),
    [item],
  )
  return useSyncExternalStore(subscribe, read, read)
}

/** The item as its row shows it: the list's facts with the live text. */
export function useLiveConversationItem<T extends ConversationItem>(
  item: T,
): T {
  const itemId = item.id
  const subscribe = useCallback(
    (listener: () => void) => subscribeLiveItem(itemId, listener),
    [itemId],
  )
  const read = useCallback(() => liveConversationItem(item), [item])
  return useSyncExternalStore(subscribe, read, read)
}
