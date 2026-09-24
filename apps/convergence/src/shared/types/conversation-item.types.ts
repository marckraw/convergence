import type { ConversationPrefix } from './conversation-prefix.types'

export const CONVERSATION_PAGE_SIZE = 300

export interface ConversationPageRequest {
  limit: number
  beforeSequence?: number
}

export interface ConversationPage<Item> {
  items: Item[]
  hasOlder: boolean
  oldestSequence: number | null
  prefix: ConversationPrefix
}

/** Local main-to-window transport; service and remote-wire events stay full. */
export type ConversationWireEvent<Item> =
  | { op: 'add' | 'patch'; sessionId: string; item: Item }
  | {
      op: 'append'
      sessionId: string
      itemId: string
      baseLength: number
      append: string
      updatedAt: string
    }
  | (ConversationPage<Item> & {
      op: 'snapshot'
      sessionId: string
      generation: number
      pageNonce: string
    })
  | (ConversationPage<Item> & {
      op: 'older-page'
      sessionId: string
      generation: number
      pageNonce: string
      beforeSequence: number
    })
