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
  | 'ultra'

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
  previousAssistantTexts?: string[]
  model: string | null
  effort: ReasoningEffort | null
  serviceTier?: string | null
  continuationToken: string | null
  /**
   * Whether the conversation named by `continuationToken` has carried no turn
   * since the last boundary — the ledger's answer, not the provider's guess.
   *
   * A deliberate `/clear` opens a fresh Codex thread, and a thread only gets a
   * rollout once it has taken a user message. So the message after a clear
   * resumes a thread the server has never written down, is refused, and used to
   * be routed through the same recovery path a genuinely lost conversation
   * takes — announcing that "previous provider context may be missing" when a
   * boundary two lines above says the user asked for exactly that (MAR-2854).
   *
   * The wording of the refusal cannot answer this: a rollout pruned off disk
   * from a conversation that *did* run refuses in the same words, and there the
   * warning is true and must survive. Only the transcript knows which of the
   * two happened, so the transcript is asked.
   */
  noTurnSinceBoundary?: boolean
  permissionConfig?: SessionPermissionConfig
  /**
   * Provider account for the session's first turn. Composer state only after
   * that: the authoritative record is per-turn, because switching happens
   * between turns and one logical turn can spawn several processes.
   */
  providerAccountId?: string | null
  /**
   * Workspace materialization source for hosts that cannot use
   * `workingDirectory` (a remote host clones this repository and runs the
   * session in a per-session worktree). Local execution ignores it.
   */
  workspace?: {
    repository: string
    ref?: string | null
    branchName?: string | null
  }
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
  packageName: string | null
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

export type ProviderContextManagementAvailability =
  | 'available'
  | 'runtime-check'
  | 'unavailable'

/**
 * Strategy capability: describes how a provider can reduce live conversation
 * context while keeping provider mechanics behind the adapter boundary.
 */
export interface ProviderContextManagementCapability {
  compact: {
    availability: ProviderContextManagementAvailability
    method: 'native-rpc' | 'slash-command' | 'unsupported'
    supportsInstructions: boolean
    notes?: string
  }
}

export interface ProviderContextManagementInput {
  kind: 'compact'
  instructions?: string
}

export interface ProviderContextManagementResult {
  kind: 'compact'
  contextWindow: SessionContextWindow
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
  supportsLiveModelSelection?: boolean
  id: string
  name: string
  vendorLabel: string
  kind: ProviderKind
  supportsContinuation: boolean
  /**
   * Whether this provider can be told to start the conversation over inside a
   * session that already exists (R8, RUN45).
   *
   * REQUIRED rather than optional, deliberately: the Canvas offers "clear the
   * conversation first" only where it actually works, and a provider that
   * shipped without answering this question would silently inherit somebody
   * else's answer. The compiler asks every new provider instead.
   *
   * Distinct from `contextManagement`, which is about SUMMARISING a long
   * conversation to keep going. This is about throwing it away.
   */
  supportsConversationReset: boolean
  defaultModelId: string
  fastModelId?: string | null
  modelOptions: ProviderModelOption[]
  attachments: ProviderAttachmentCapability
  midRunInput: ProviderMidRunInputCapability
  interactions?: ProviderInteractionCapability
  skills?: ProviderSkillsCapability
  configOptions?: ProviderConfigOption[]
  telemetry?: ProviderTelemetryCapability
  contextManagement?: ProviderContextManagementCapability
  settings?: ProviderSettingsInfo
}

export interface OneShotInput {
  prompt: string
  modelId: string
  effort?: ReasoningEffort | null
  serviceTier?: string | null
  workingDirectory: string
  timeoutMs?: number
  requestId?: string
  permissionConfig?: SessionPermissionConfig
  /**
   * Provider account to spend on this call. An explicit `null` means the
   * ambient default account — the behaviour every one-shot had before accounts
   * existed.
   *
   * The Codex helper refuses a call that leaves this `undefined` (MAR-2824
   * R5), whether the key is absent or spread in unfilled: either way nobody
   * said whose subscription pays, while an explicit `null` is a caller that
   * means the ambient login.
   */
  providerAccountId?: string | null
  /**
   * JSON schema the answer must satisfy, for callers that want structured
   * output instead of prose to parse.
   *
   * Honoured by providers that can ask their model for it (Codex passes it to
   * `turn/start`, measured on codex-cli 0.153.4) and ignored by the rest, so a
   * caller that sets it must still validate what comes back.
   */
  outputSchema?: unknown
}

export interface OneShotResult {
  text: string
}

export interface SessionHandle {
  /** A local process whose lifetime spans completed user turns. */
  resident?: boolean
  retainQueuedInputsOnCompletion?: boolean
  interrupt?: () => Promise<'interrupted' | 'not-applicable'>
  setModelSelection?: (
    model: string | null,
    effort: ReasoningEffort | null,
  ) => Promise<void>
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
      /**
       * Account for the new logical turn this message starts. Ignored when the
       * message continues a turn already in flight — an answer to a deferred
       * tool belongs to the account that asked the question.
       */
      providerAccountId?: string | null
    },
  ) => void
  approve: (providerApprovalId?: string) => void
  deny: (providerApprovalId?: string) => void
  stop: () => void
  /** Releases local resources without changing the persisted session state. */
  dispose?: (reason?: 'quit' | 'stop') => void | Promise<void>
}

export interface Provider {
  id: string
  name: string
  supportsContinuation: boolean
  describe: () => Promise<ProviderDescriptor>
  start: (config: SessionStartConfig) => SessionHandle
  manageContext?: (
    config: SessionStartConfig,
    input: ProviderContextManagementInput,
  ) => Promise<ProviderContextManagementResult>
  oneShot?: (input: OneShotInput) => Promise<OneShotResult>
}
