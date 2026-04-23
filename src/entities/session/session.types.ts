export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed'
export type AttentionState =
  | 'none'
  | 'needs-input'
  | 'needs-approval'
  | 'finished'
  | 'failed'
export type ReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'max'
  | 'xhigh'

export type ActivitySignal =
  | null
  | 'streaming'
  | 'thinking'
  | 'compacting'
  | 'waiting-approval'
  | `tool:${string}`

export type ContextWindowSource = 'provider' | 'estimated'

export type SessionContextWindow =
  | {
      availability: 'available'
      source: ContextWindowSource
      usedTokens: number
      windowTokens: number
      usedPercentage: number
      remainingPercentage: number
    }
  | {
      availability: 'unavailable'
      source: ContextWindowSource
      reason: string
    }

export type ForkStrategy = 'full' | 'summary'

export type PrimarySurface = 'conversation' | 'terminal'

export type ProviderKind = 'conversation' | 'shell'

export type NeedsYouDisposition = 'snoozed' | 'acknowledged'

export interface NeedsYouDismissal {
  updatedAt: string
  disposition: NeedsYouDisposition
}

export type NeedsYouDismissals = Record<string, NeedsYouDismissal>

export interface ProviderEffortOption {
  id: ReasoningEffort
  label: string
  description?: string
}

export interface ProviderModelOption {
  id: string
  label: string
  defaultEffort: ReasoningEffort | null
  effortOptions: ProviderEffortOption[]
}

export type ConversationItemKind =
  | 'message'
  | 'thinking'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'input-request'
  | 'note'

export type ConversationItemState = 'streaming' | 'complete' | 'error'

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
    })
  | (ConversationItemBase & {
      kind: 'note'
      level: 'info' | 'warning' | 'error'
      text: string
    })

export interface ConversationPatchEvent {
  sessionId: string
  op: 'add' | 'patch'
  item: ConversationItem
}

export interface SessionSummary {
  id: string
  projectId: string
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  name: string
  status: SessionStatus
  attention: AttentionState
  activity: ActivitySignal
  contextWindow: SessionContextWindow | null
  workingDirectory: string
  archivedAt: string | null
  parentSessionId: string | null
  forkStrategy: ForkStrategy | null
  primarySurface: PrimarySurface
  continuationToken: string | null
  lastSequence: number
  createdAt: string
  updatedAt: string
}

export type Session = SessionSummary

export interface ProviderAttachmentCapability {
  supportsImage: boolean
  supportsPdf: boolean
  supportsText: boolean
  maxImageBytes: number
  maxPdfBytes: number
  maxTextBytes: number
  maxTotalBytes: number
}

export interface ProviderInfo {
  id: string
  name: string
  vendorLabel: string
  kind: ProviderKind
  supportsContinuation: boolean
  defaultModelId: string
  fastModelId?: string | null
  modelOptions: ProviderModelOption[]
  attachments: ProviderAttachmentCapability
}

export function isConversationalProvider(provider: {
  kind: ProviderKind
}): boolean {
  return provider.kind === 'conversation'
}

export interface ProviderStatusInfo {
  id: string
  name: string
  vendorLabel: string
  availability: 'available' | 'unavailable'
  statusLabel: string
  binaryPath: string | null
  version: string | null
  reason: string | null
}
