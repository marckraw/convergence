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

export type TranscriptEntry =
  | {
      type: 'user'
      text: string
      timestamp: string
      attachmentIds?: string[]
    }
  | {
      type: 'assistant'
      text: string
      timestamp: string
      streaming?: boolean
    }
  | { type: 'tool-use'; tool: string; input: string; timestamp: string }
  | { type: 'tool-result'; result: string; timestamp: string }
  | {
      type: 'approval-request'
      description: string
      timestamp: string
    }
  | { type: 'input-request'; prompt: string; timestamp: string }
  | { type: 'system'; text: string; timestamp: string }

export interface Session {
  id: string
  projectId: string
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  name: string
  status: SessionStatus
  attention: AttentionState
  workingDirectory: string
  transcript: TranscriptEntry[]
  contextWindow?: SessionContextWindow | null
  activity?: ActivitySignal
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
}

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
  supportsContinuation: boolean
  defaultModelId: string
  fastModelId?: string | null
  modelOptions: ProviderModelOption[]
  attachments: ProviderAttachmentCapability
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
