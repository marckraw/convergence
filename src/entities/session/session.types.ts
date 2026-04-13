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
  createdAt: string
  updatedAt: string
}

export interface ProviderInfo {
  id: string
  name: string
  vendorLabel: string
  supportsContinuation: boolean
  defaultModelId: string
  modelOptions: ProviderModelOption[]
}
