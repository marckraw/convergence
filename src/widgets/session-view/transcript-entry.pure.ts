import type { ConversationItem } from '@/entities/session'

export function getConversationItemCopyText(item: ConversationItem): string {
  switch (item.kind) {
    case 'message':
      return item.text
    case 'thinking':
      return item.text
    case 'tool-call':
      return item.inputText
    case 'tool-result':
      return item.outputText
    case 'approval-request':
      return item.description
    case 'input-request':
      return item.prompt
    case 'note':
      return item.text
  }
}
