import type {
  Attachment,
  ProviderAttachmentCapability,
} from '../attachments/attachments.types'
import type {
  InteractionResponse,
  SessionDelta,
} from '../session/conversation-item.types'
import type {
  SkillActivationConfirmation,
  SkillCatalogSource,
  SkillInvocationSupport,
  SkillSelection,
} from '../skills/skills.types'

export type { Attachment, ProviderAttachmentCapability }

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

export type SessionPermissionPreset = 'ask' | 'yolo' | 'custom'
export type CodexApprovalPolicy = 'untrusted' | 'on-request' | 'never'
export type CodexSandboxMode =
  | 'read-only'
  | 'workspace-write'
  | 'danger-full-access'
export type ClaudeCodePermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'auto'
  | 'dontAsk'
  | 'plan'
  | 'bypassPermissions'

export interface SessionPermissionConfig {
  preset: SessionPermissionPreset
  codex?: {
    approvalPolicy: CodexApprovalPolicy
    sandbox: CodexSandboxMode
  }
  claudeCode?: {
    permissionMode: ClaudeCodePermissionMode
  }
}

export type ActivitySignal =
  | null
  | 'streaming'
  | 'thinking'
  | 'compacting'
  | 'waiting-approval'
  | `tool:${string}`

export type MidRunInputMode =
  | 'normal'
  | 'answer'
  | 'follow-up'
  | 'steer'
  | 'interrupt'

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

// Legacy transcript blobs remain only for one-time DB migration and tests.
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

export interface SessionStartConfig {
  sessionId: string
  workingDirectory: string
  initialMessage: string
  initialAttachments?: Attachment[]
  initialSkillSelections?: SkillSelection[]
  model: string | null
  effort: ReasoningEffort | null
  continuationToken: string | null
  permissionConfig?: SessionPermissionConfig
}

export interface ProviderEffortOption {
  id: ReasoningEffort
  label: string
  description?: string
}

export type ProviderInputModality = 'text' | 'image'

export interface ProviderModelOption {
  id: string
  label: string
  description?: string
  contextWindowTokens?: number | null
  defaultEffort: ReasoningEffort | null
  effortOptions: ProviderEffortOption[]
  inputModalities?: ProviderInputModality[]
  source?: 'pi-models-json' | 'provider'
}

export interface ProviderStatusInfo {
  id: string
  name: string
  vendorLabel: string
  availability: 'available' | 'unavailable'
  statusLabel: string
  binaryPath: string | null
  install: ProviderInstallInfo | null
  version: string | null
  reason: string | null
  update: ProviderUpdateInfo
}

export type ProviderInstallManager = 'npm' | 'homebrew' | 'self' | 'unknown'

export interface ProviderInstallInfo {
  manager: ProviderInstallManager
  realBinaryPath: string
  packageName: string | null
  packageDirectory: string | null
  prefixDirectory: string | null
  npmPath: string | null
  nodePath: string | null
  nodeVersion: string | null
  brewPrefix: string | null
  formulaName: string | null
}

export interface ProviderRuntimeInfo {
  appNodeVersion: string
  electronVersion: string | null
  appVersion: string
  isPackaged: boolean
  platform: NodeJS.Platform
  arch: string
}

export type ProviderUpdateStatus = 'current' | 'outdated' | 'unknown'
export type ProviderUpdateCapability = 'automatic' | 'manual'
export type ProviderUpdateStrategy =
  | 'npm-global'
  | 'provider-self-update'
  | 'brew-upgrade'
  | null

export interface ProviderUpdateInfo {
  currentVersion: string | null
  latestVersion: string | null
  status: ProviderUpdateStatus
  packageName: string
  installCommand: string
  updateCommand: string
  manualUpdateCommand: string
  automaticUpdateCommand: string | null
  updateCapability: ProviderUpdateCapability
  updateStrategy: ProviderUpdateStrategy
  checkError: string | null
}

export interface ProviderUpdateResult {
  ok: boolean
  providerId: string
  command: string
  stdout: string
  stderr: string
  error: string | null
}

export type ProviderKind = 'conversation' | 'shell'

export interface ProviderSkillsCapability {
  catalog: SkillCatalogSource
  invocation: SkillInvocationSupport
  activationConfirmation: SkillActivationConfirmation
}

export interface ProviderMidRunInputCapability {
  supportsAnswer: boolean
  supportsNativeFollowUp: boolean
  supportsAppQueuedFollowUp: boolean
  supportsSteer: boolean
  supportsInterrupt: boolean
  defaultRunningMode: Extract<MidRunInputMode, 'follow-up' | 'steer'> | null
  notes?: string
}

export type ProviderInteractionRequestKind =
  | 'text'
  | 'choice'
  | 'plan'
  | 'form'
  | 'url'

export type ProviderPassiveInteractionKind =
  | 'todos'
  | 'task'
  | 'generated-image'

export interface ProviderInteractionCapability {
  inputRequests: ProviderInteractionRequestKind[]
  passiveUpdates: ProviderPassiveInteractionKind[]
  unavailable: string[]
  notes?: string
}

export type ProviderConfigOptionSource = 'provider' | 'fallback'
export type ProviderConfigPersistence =
  | 'session'
  | 'provider-managed'
  | 'unsupported'

export interface ProviderConfigSelectOption {
  id: string
  label: string
  description?: string
}

export interface ProviderConfigOption {
  id: string
  label: string
  description?: string
  currentValue: string | null
  options: ProviderConfigSelectOption[]
  source: ProviderConfigOptionSource
  persistence: ProviderConfigPersistence
  method?: string
  notes?: string
}

export type ProviderTelemetryAvailability =
  | 'available'
  | 'partial'
  | 'unavailable'

export interface ProviderTelemetryCapability {
  contextWindow: {
    availability: ProviderTelemetryAvailability
    source: 'provider' | 'model-metadata' | 'none'
    notes?: string
  }
  quota: {
    availability: ProviderTelemetryAvailability
    source: 'provider-api' | 'provider-event' | 'manual' | 'none'
    usageUrl?: string
    notes?: string
  }
}

export interface ProviderSettingsHelpItem {
  label: string
  value: string
}

export interface ProviderSettingsLink {
  label: string
  url: string
}

export interface ProviderSettingsInfo {
  help: ProviderSettingsHelpItem[]
  links?: ProviderSettingsLink[]
}

export interface ProviderDescriptor {
  id: string
  name: string
  vendorLabel: string
  kind: ProviderKind
  supportsContinuation: boolean
  defaultModelId: string
  fastModelId?: string | null
  modelOptions: ProviderModelOption[]
  attachments: ProviderAttachmentCapability
  midRunInput: ProviderMidRunInputCapability
  interactions?: ProviderInteractionCapability
  skills?: ProviderSkillsCapability
  configOptions?: ProviderConfigOption[]
  telemetry?: ProviderTelemetryCapability
  settings?: ProviderSettingsInfo
}

export interface OneShotInput {
  prompt: string
  modelId: string
  effort?: ReasoningEffort | null
  workingDirectory: string
  timeoutMs?: number
  requestId?: string
  permissionConfig?: SessionPermissionConfig
}

export interface OneShotResult {
  text: string
}

export interface SessionHandle {
  onDelta: (callback: (delta: SessionDelta) => void) => void
  onStatusChange: (callback: (status: SessionStatus) => void) => void
  onAttentionChange: (callback: (attention: AttentionState) => void) => void
  onContinuationToken: (callback: (token: string) => void) => void
  onContextWindowChange: (
    callback: (contextWindow: SessionContextWindow) => void,
  ) => void
  onActivityChange: (callback: (activity: ActivitySignal) => void) => void
  onActivityHeartbeat?: (callback: () => void) => void

  sendMessage: (
    text: string,
    attachments?: Attachment[],
    skillSelections?: SkillSelection[],
    options?: {
      deliveryMode: MidRunInputMode
      queuedInputId?: string | null
      expectedProviderTurnId?: string | null
      interactionResponse?: InteractionResponse
    },
  ) => void
  approve: (providerApprovalId?: string) => void
  deny: (providerApprovalId?: string) => void
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
