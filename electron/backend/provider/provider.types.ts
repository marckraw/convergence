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

export type TranscriptEntry =
  | { type: 'user'; text: string; timestamp: string }
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

export interface SessionStartConfig {
  sessionId: string
  workingDirectory: string
  initialMessage: string
  model: string | null
  effort: ReasoningEffort | null
  continuationToken: string | null
}

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

export interface ProviderDescriptor {
  id: string
  name: string
  vendorLabel: string
  supportsContinuation: boolean
  defaultModelId: string
  fastModelId?: string | null
  modelOptions: ProviderModelOption[]
}

export interface OneShotInput {
  prompt: string
  modelId: string
  workingDirectory: string
  timeoutMs?: number
}

export interface OneShotResult {
  text: string
}

export interface SessionHandle {
  onTranscriptEntry: (callback: (entry: TranscriptEntry) => void) => void
  onStatusChange: (callback: (status: SessionStatus) => void) => void
  onAttentionChange: (callback: (attention: AttentionState) => void) => void
  onContinuationToken: (callback: (token: string) => void) => void
  onContextWindowChange: (
    callback: (contextWindow: SessionContextWindow) => void,
  ) => void
  onActivityChange: (callback: (activity: ActivitySignal) => void) => void

  sendMessage: (text: string) => void
  approve: () => void
  deny: () => void
  stop: () => void
}

export interface Provider {
  id: string
  name: string
  supportsContinuation: boolean
  describe: () => Promise<ProviderDescriptor>
  start: (config: SessionStartConfig) => SessionHandle
  oneShot?: (input: OneShotInput) => Promise<OneShotResult>
}
