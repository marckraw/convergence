import type { TranscriptEntry } from '../provider/provider.types'
import type { SkillSelection } from '../skills/skills.types'
import type { SessionSummary } from './session.types'
import type { Turn, TurnFileChange } from './turn/turn.types'

export type ConversationItemKind =
  | 'message'
  | 'thinking'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'input-request'
  | 'note'

export type ConversationItemState = 'streaming' | 'complete' | 'error'

export interface InteractionChoiceOption {
  label: string
  description?: string
  preview?: string
}

export interface InteractionQuestion {
  id: string
  question: string
  header: string
  options: InteractionChoiceOption[]
  multiSelect: boolean
}

export type InteractionRequest =
  | {
      kind: 'text'
      prompt: string
    }
  | {
      kind: 'choice'
      questions: InteractionQuestion[]
    }

export interface InteractionChoiceResponse {
  kind: 'choice'
  answers: Array<{
    questionId: string
    values: string[]
  }>
}

export type InteractionResponse = InteractionChoiceResponse

export interface ConversationItemBase {
  id: string
  sessionId: string
  sequence: number
  turnId: string | null
  kind: ConversationItemKind
  state: ConversationItemState
  createdAt: string
  updatedAt: string
  providerMeta: {
    providerId: string
    providerItemId: string | null
    providerEventType: string | null
  }
}

export type ConversationItem =
  | (ConversationItemBase & {
      kind: 'message'
      actor: 'user' | 'assistant'
      text: string
      attachmentIds?: string[]
      skillSelections?: SkillSelection[]
      deliveryMode?: 'steer' | 'follow-up'
    })
  | (ConversationItemBase & {
      kind: 'thinking'
      actor: 'assistant'
      text: string
    })
  | (ConversationItemBase & {
      kind: 'tool-call'
      toolName: string
      inputText: string
    })
  | (ConversationItemBase & {
      kind: 'tool-result'
      toolName: string | null
      relatedItemId: string | null
      outputText: string
    })
  | (ConversationItemBase & {
      kind: 'approval-request'
      description: string
    })
  | (ConversationItemBase & {
      kind: 'input-request'
      prompt: string
      request?: InteractionRequest
    })
  | (ConversationItemBase & {
      kind: 'note'
      level: 'info' | 'warning' | 'error'
      text: string
    })

export type ConversationItemDraft = ConversationItem extends infer T
  ? T extends unknown
    ? Omit<T, 'sessionId' | 'sequence'>
    : never
  : never

export type SessionDelta =
  | {
      kind: 'session.patch'
      patch: Partial<
        Pick<
          SessionSummary,
          | 'status'
          | 'attention'
          | 'activity'
          | 'contextWindow'
          | 'continuationToken'
          | 'updatedAt'
        >
      >
    }
  | {
      kind: 'conversation.item.add'
      item: ConversationItemDraft
    }
  | {
      kind: 'conversation.item.patch'
      itemId: string
      patch: Partial<ConversationItem>
    }
  | {
      kind: 'turn.add'
      turn: Turn
    }
  | {
      kind: 'turn.fileChanges.add'
      turnId: string
      fileChanges: TurnFileChange[]
    }

export interface ConversationPatchEvent {
  sessionId: string
  op: 'add' | 'patch'
  item: ConversationItem
}

export interface ConversationItemInsertRow {
  id: string
  sessionId: string
  sequence: number
  turnId: string | null
  kind: ConversationItemKind
  state: ConversationItemState
  payloadJson: string
  providerItemId: string | null
  providerEventType: string | null
  createdAt: string
  updatedAt: string
}

export interface BuildConversationItemFromTranscriptEntryInput {
  id: string
  sessionId: string
  providerId: string
  sequence: number
  turnId: string | null
  entry: TranscriptEntry
}
