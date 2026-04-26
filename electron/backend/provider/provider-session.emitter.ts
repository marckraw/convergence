import { randomUUID } from 'crypto'
import type {
  SessionDelta,
  ConversationItem,
  ConversationItemDraft,
} from '../session/conversation-item.types'
import type { SessionSummary } from '../session/session.types'
import type { SkillSelection } from '../skills/skills.types'

type MessageItem = Extract<ConversationItem, { kind: 'message' }>

interface ProviderSessionEmitterOptions {
  providerId: string
  emitDelta: (delta: SessionDelta) => void
  now?: () => string
}

export class ProviderSessionEmitter {
  private readonly providerId: string
  private readonly emitDeltaFn: (delta: SessionDelta) => void
  private readonly now: () => string

  constructor(options: ProviderSessionEmitterOptions) {
    this.providerId = options.providerId
    this.emitDeltaFn = options.emitDelta
    this.now = options.now ?? (() => new Date().toISOString())
  }

  patchSession(
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
    >,
  ): void {
    this.emitDeltaFn({
      kind: 'session.patch',
      patch: {
        ...patch,
        updatedAt: patch.updatedAt ?? this.now(),
      },
    })
  }

  addUserMessage(input: {
    text: string
    attachmentIds?: string[]
    skillSelections?: SkillSelection[]
    timestamp?: string
    deliveryMode?: 'steer' | 'follow-up'
  }): string {
    return this.addMessage({
      actor: 'user',
      text: input.text,
      attachmentIds: input.attachmentIds,
      skillSelections: input.skillSelections,
      timestamp: input.timestamp,
      providerEventType: 'user',
      deliveryMode: input.deliveryMode,
    })
  }

  addAssistantMessage(input: {
    text: string
    state?: MessageItem['state']
    timestamp?: string
    providerItemId?: string | null
    providerEventType?: string | null
  }): string {
    return this.addMessage({
      actor: 'assistant',
      text: input.text,
      state: input.state,
      timestamp: input.timestamp,
      providerItemId: input.providerItemId,
      providerEventType: input.providerEventType ?? 'assistant',
    })
  }

  patchMessage(
    itemId: string,
    patch: Partial<MessageItem> & {
      updatedAt?: string
    },
  ): void {
    this.emitDeltaFn({
      kind: 'conversation.item.patch',
      itemId,
      patch: {
        ...patch,
        updatedAt: patch.updatedAt ?? this.now(),
      },
    })
  }

  addToolCall(input: {
    toolName: string
    inputText: string
    timestamp?: string
    providerItemId?: string | null
    providerEventType?: string | null
  }): string {
    const timestamp = input.timestamp ?? this.now()
    const item = this.buildBaseItem({
      kind: 'tool-call',
      state: 'complete',
      timestamp,
      providerItemId: input.providerItemId,
      providerEventType: input.providerEventType ?? 'tool-use',
      payload: {
        toolName: input.toolName,
        inputText: input.inputText,
      },
    })
    this.emitItem(item)
    return item.id
  }

  addToolResult(input: {
    outputText: string
    toolName?: string | null
    relatedItemId?: string | null
    timestamp?: string
    state?: ConversationItem['state']
    providerItemId?: string | null
    providerEventType?: string | null
  }): string {
    const timestamp = input.timestamp ?? this.now()
    const item = this.buildBaseItem({
      kind: 'tool-result',
      state: input.state ?? 'complete',
      timestamp,
      providerItemId: input.providerItemId,
      providerEventType: input.providerEventType ?? 'tool-result',
      payload: {
        toolName: input.toolName ?? null,
        relatedItemId: input.relatedItemId ?? null,
        outputText: input.outputText,
      },
    })
    this.emitItem(item)
    return item.id
  }

  addApprovalRequest(input: {
    description: string
    timestamp?: string
    providerItemId?: string | null
    providerEventType?: string | null
  }): string {
    const timestamp = input.timestamp ?? this.now()
    const item = this.buildBaseItem({
      kind: 'approval-request',
      state: 'complete',
      timestamp,
      providerItemId: input.providerItemId,
      providerEventType: input.providerEventType ?? 'approval-request',
      payload: {
        description: input.description,
      },
    })
    this.emitItem(item)
    return item.id
  }

  addInputRequest(input: {
    prompt: string
    timestamp?: string
    providerItemId?: string | null
    providerEventType?: string | null
  }): string {
    const timestamp = input.timestamp ?? this.now()
    const item = this.buildBaseItem({
      kind: 'input-request',
      state: 'complete',
      timestamp,
      providerItemId: input.providerItemId,
      providerEventType: input.providerEventType ?? 'input-request',
      payload: {
        prompt: input.prompt,
      },
    })
    this.emitItem(item)
    return item.id
  }

  addNote(input: {
    text: string
    level: 'info' | 'warning' | 'error'
    timestamp?: string
    state?: ConversationItem['state']
    providerItemId?: string | null
    providerEventType?: string | null
  }): string {
    const timestamp = input.timestamp ?? this.now()
    const item = this.buildBaseItem({
      kind: 'note',
      state: input.state ?? (input.level === 'error' ? 'error' : 'complete'),
      timestamp,
      providerItemId: input.providerItemId,
      providerEventType: input.providerEventType ?? 'system',
      payload: {
        level: input.level,
        text: input.text,
      },
    })
    this.emitItem(item)
    return item.id
  }

  private addMessage(input: {
    actor: 'user' | 'assistant'
    text: string
    attachmentIds?: string[]
    skillSelections?: SkillSelection[]
    state?: MessageItem['state']
    timestamp?: string
    providerItemId?: string | null
    providerEventType?: string | null
    deliveryMode?: 'steer' | 'follow-up'
  }): string {
    const timestamp = input.timestamp ?? this.now()
    const item = this.buildBaseItem({
      kind: 'message',
      state: input.state ?? 'complete',
      timestamp,
      providerItemId: input.providerItemId,
      providerEventType: input.providerEventType,
      payload: {
        actor: input.actor,
        text: input.text,
        ...(input.attachmentIds ? { attachmentIds: input.attachmentIds } : {}),
        ...(input.skillSelections
          ? { skillSelections: input.skillSelections }
          : {}),
        ...(input.deliveryMode ? { deliveryMode: input.deliveryMode } : {}),
      },
    }) as MessageItem
    this.emitItem(item)
    return item.id
  }

  private emitItem(item: ConversationItemDraft): void {
    this.emitDeltaFn({
      kind: 'conversation.item.add',
      item,
    })
  }

  private buildBaseItem<TKind extends ConversationItem['kind']>(input: {
    kind: TKind
    state: ConversationItem['state']
    timestamp: string
    providerItemId?: string | null
    providerEventType?: string | null
    payload: Omit<
      Extract<ConversationItem, { kind: TKind }>,
      | 'id'
      | 'sessionId'
      | 'sequence'
      | 'turnId'
      | 'kind'
      | 'state'
      | 'createdAt'
      | 'updatedAt'
      | 'providerMeta'
    >
  }): Extract<ConversationItem, { kind: TKind }> {
    return {
      id: randomUUID(),
      turnId: null,
      kind: input.kind,
      state: input.state,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
      providerMeta: {
        providerId: this.providerId,
        providerItemId: input.providerItemId ?? null,
        providerEventType: input.providerEventType ?? null,
      },
      ...input.payload,
    } as Extract<ConversationItem, { kind: TKind }>
  }
}
