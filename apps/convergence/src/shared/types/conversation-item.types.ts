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
  | { op: 'snapshot'; sessionId: string; items: Item[]; generation: number }
