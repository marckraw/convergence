import type { ProjectMcpVisibility } from './mcp.types'
import type {
  CreatePromptLibraryInput,
  DeletePromptLibraryInput,
  PromptLibraryCatalog,
  PromptLibraryDetails,
  PromptLibraryDetailsRequest,
  PromptLibraryEntry,
  PromptLibraryOptions,
  UpdatePromptLibraryInput,
} from './prompt-library.types'
import type {
  ProjectSkillCatalog,
  ProviderSkillCatalog,
  SkillActivationConfirmation,
  SkillCatalogOptions,
  SkillCatalogSource,
  SkillDetails,
  SkillDetailsRequest,
  SkillInvocationSupport,
  SkillProviderId,
  SkillProviderListing,
  SkillSelection,
} from './skill.types'

interface ProjectData {
  id: string
  name: string
  repositoryPath: string
  settings: ProjectSettings
  createdAt: string
  updatedAt: string
}

type WorkspaceStartStrategy = 'base-branch' | 'current-head'

interface WorkspaceCreationSettings {
  startStrategy: WorkspaceStartStrategy
  baseBranchName: string | null
}

type WorkspaceEnvFileCopyMode = 'copy-missing' | 'overwrite' | 'disabled'

interface WorkspaceEnvFileSettings {
  copyMode: WorkspaceEnvFileCopyMode
  patterns: string[]
}

interface ProjectSettings {
  workspaceCreation: WorkspaceCreationSettings
  workspaceEnvFiles: WorkspaceEnvFileSettings
}

interface CreateProjectInput {
  repositoryPath: string
  name?: string
}

interface CloneProjectInput {
  remoteUrl: string
  parentDirectory: string
  directoryName?: string
  name?: string
}

type ProjectOpenAppIdData = 'cursor' | 'vscode' | 'zed' | 'webstorm' | 'finder'

type ProjectOpenAppKindData = 'editor' | 'file-manager'

interface ProjectOpenAppData {
  id: ProjectOpenAppIdData
  label: string
  kind: ProjectOpenAppKindData
}

interface ProjectOpenRequestData {
  appId: ProjectOpenAppIdData
  path: string
}

type SpaceStatusData =
  | 'exploring'
  | 'planned'
  | 'implementing'
  | 'reviewing'
  | 'ready-to-merge'
  | 'merged'
  | 'released'
  | 'parked'
  | 'discarded'

type SpaceAttentionData =
  | 'none'
  | 'needs-you'
  | 'needs-decision'
  | 'blocked'
  | 'stale'

type SpaceAttemptRoleData =
  | 'seed'
  | 'exploration'
  | 'implementation'
  | 'review'
  | 'hardening'
  | 'docs'

type SpaceArtifactKindData =
  | 'pull-request'
  | 'branch'
  | 'commit-range'
  | 'release'
  | 'spec'
  | 'documentation'
  | 'migration-note'
  | 'external-issue'
  | 'other'

type SpaceArtifactStatusData =
  | 'planned'
  | 'in-progress'
  | 'ready'
  | 'merged'
  | 'released'
  | 'abandoned'

interface SpaceData {
  id: string
  title: string
  status: SpaceStatusData
  attention: SpaceAttentionData
  brief: string
  memory: string
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
}

interface SpaceAttemptData {
  id: string
  spaceId: string
  sessionId: string
  role: SpaceAttemptRoleData
  isPrimary: boolean
  createdAt: string
}

interface SpaceArtifactData {
  id: string
  spaceId: string
  kind: SpaceArtifactKindData
  label: string
  value: string
  sourceSessionId: string | null
  status: SpaceArtifactStatusData
  createdAt: string
  updatedAt: string
}

interface SpaceSourceData {
  id: string
  spaceId: string
  filename: string
  originalPath: string
  storagePath: string
  sizeBytes: number
  createdAt: string
}

interface CreateSpaceInputData {
  title: string
  status?: SpaceStatusData
  attention?: SpaceAttentionData
  brief?: string
  memory?: string
}

interface UpdateSpaceInputData {
  title?: string
  status?: SpaceStatusData
  attention?: SpaceAttentionData
  brief?: string
  memory?: string
}

interface LinkSpaceAttemptInputData {
  spaceId: string
  sessionId: string
  role?: SpaceAttemptRoleData
  isPrimary?: boolean
}

interface UpdateSpaceAttemptInputData {
  role?: SpaceAttemptRoleData
}

interface CreateSpaceArtifactInputData {
  spaceId: string
  kind: SpaceArtifactKindData
  label: string
  value: string
  sourceSessionId?: string | null
  status?: SpaceArtifactStatusData
}

interface UpdateSpaceArtifactInputData {
  kind?: SpaceArtifactKindData
  label?: string
  value?: string
  sourceSessionId?: string | null
  status?: SpaceArtifactStatusData
}

interface SpaceSynthesisArtifactSuggestionData {
  kind: SpaceArtifactKindData
  label: string
  value: string
  sourceSessionId: string | null
  status: SpaceArtifactStatusData
}

interface SpaceSynthesisResultData {
  brief: string
  decisions: string[]
  openQuestions: string[]
  nextAction: string
  artifacts: SpaceSynthesisArtifactSuggestionData[]
}

interface BranchOutputFactsData {
  branchName: string
  upstreamBranch: string | null
  remoteUrl: string | null
}

type BaseBranchResolutionSourceData =
  | 'pull-request'
  | 'project-settings'
  | 'remote-default'
  | 'convention'
  | 'current-branch'

interface ResolvedBaseBranchData {
  branchName: string
  comparisonRef: string
  source: BaseBranchResolutionSourceData
  warning: string | null
}

interface GitStatusEntryData {
  status: string
  file: string
}

interface BaseBranchDiffSummaryData {
  base: ResolvedBaseBranchData
  comparisonPoint: string
  files: GitStatusEntryData[]
}

type CodeReviewModeData = 'working-tree' | 'base-branch'

type CodeReviewTargetSourceData =
  | 'session'
  | 'workspace'
  | 'project-repository'
  | 'pull-request'

interface CodeReviewTargetStatusData {
  workingTreeFileCount: number
  workingTreeStatusCounts: Record<string, number>
  error: string | null
}

interface CodeReviewTargetData {
  id: string
  projectId: string
  projectName: string
  repositoryPath: string
  workspaceId: string | null
  sessionId: string | null
  sessionName: string | null
  branchName: string | null
  pullRequestId: string | null
  pullRequestNumber: number | null
  pullRequestLabel: string | null
  pullRequestUrl: string | null
  pullRequestBaseBranch: string | null
  pullRequestHeadBranch: string | null
  source: CodeReviewTargetSourceData
  updatedAt: string | null
  status: CodeReviewTargetStatusData
}

interface CodeReviewListTargetsRequestData {
  projectId: string
  sessionId?: string | null
}

interface CodeReviewSummaryRequestData {
  target: CodeReviewTargetData
  mode: CodeReviewModeData
}

interface CodeReviewCacheIdentityData {
  comparisonRef: string | null
  comparisonPoint: string | null
  workingTreeVersionToken: string
}

interface CodeReviewFilePatchRequestData extends CodeReviewSummaryRequestData {
  filePath: string
  cacheIdentity: CodeReviewCacheIdentityData
}

interface CodeReviewSummaryData {
  base: ResolvedBaseBranchData | null
  cacheIdentity: CodeReviewCacheIdentityData
  files: GitStatusEntryData[]
}

type CodeReviewGuideRiskLevelData = 'low' | 'medium' | 'high'
type CodeReviewGuideStatusData = 'ready' | 'failed'
type CodeReviewGuideGeneratorData = 'deterministic' | 'agent'

interface CodeReviewGuideFileData {
  path: string
  status: string
  reason: string
  hunkHints: string[]
}

interface CodeReviewGuideSectionData {
  id: string
  title: string
  summary: string
  narrative: string
  riskLevel: CodeReviewGuideRiskLevelData
  riskRationale: string
  checklist: string[]
  files: CodeReviewGuideFileData[]
}

interface CodeReviewGuideData {
  id: string
  projectId: string
  targetId: string
  mode: CodeReviewModeData
  cacheIdentity: CodeReviewCacheIdentityData
  status: CodeReviewGuideStatusData
  overview: string
  generatedBy: CodeReviewGuideGeneratorData
  sections: CodeReviewGuideSectionData[]
  error: string | null
  createdAt: string
  updatedAt: string
}

interface CodeReviewGuideLookupRequestData {
  target: CodeReviewTargetData
  mode: CodeReviewModeData
  cacheIdentity: CodeReviewCacheIdentityData
}

interface CodeReviewGuideGenerateRequestData extends CodeReviewGuideLookupRequestData {
  files: GitStatusEntryData[]
}

type RemoteCodeReviewDaemonConnectionStateData =
  | 'connected'
  | 'missing-base-url'
  | 'invalid-base-url'
  | 'missing-token'
  | 'auth-failed'
  | 'unreachable'
  | 'invalid-response'
  | 'daemon-error'

interface RemoteCodeReviewDaemonHealthData {
  status: 'ok'
  version: string
  apiVersion: string
  uptime: number
  activeSessions: number
  providers: Record<string, boolean>
}

interface RemoteCodeReviewDaemonMetaData {
  name: string
  version: string
  apiVersion: string
  deployment: {
    mode: string
    sharedAcrossTeams: boolean
  }
  providers: unknown[]
  git: {
    githubAuthenticated: boolean
  }
  runtime: {
    activeSessions: number
    maxConcurrentAgents: number
    uptimeSeconds: number
    host: string
    port: number
  }
}

interface RemoteCodeReviewDaemonConnectionResultData {
  ok: boolean
  state: RemoteCodeReviewDaemonConnectionStateData
  baseUrl: string | null
  message: string
  health: RemoteCodeReviewDaemonHealthData | null
  meta: RemoteCodeReviewDaemonMetaData | null
}

interface WorkspaceData {
  id: string
  projectId: string
  branchName: string
  path: string
  type: 'worktree'
  archivedAt: string | null
  worktreeRemovedAt: string | null
  createdAt: string
}

type PullRequestProviderData = 'github' | 'unknown'
type PullRequestLookupStatusData =
  | 'found'
  | 'not-found'
  | 'unsupported-remote'
  | 'gh-unavailable'
  | 'gh-auth-required'
  | 'error'
type PullRequestStateData =
  | 'none'
  | 'open'
  | 'draft'
  | 'closed'
  | 'merged'
  | 'unknown'

interface WorkspacePullRequestData {
  id: string
  projectId: string
  workspaceId: string
  provider: PullRequestProviderData
  lookupStatus: PullRequestLookupStatusData
  state: PullRequestStateData
  repositoryOwner: string | null
  repositoryName: string | null
  number: number | null
  title: string | null
  url: string | null
  isDraft: boolean
  headBranch: string | null
  baseBranch: string | null
  mergedAt: string | null
  lastCheckedAt: string
  error: string | null
  createdAt: string
  updatedAt: string
}

interface PullRequestReviewPreviewData {
  projectId: string
  projectName: string
  repositoryOwner: string
  repositoryName: string
  number: number
  title: string | null
  url: string | null
  state: PullRequestStateData
  isDraft: boolean
  headBranch: string | null
  baseBranch: string | null
  mergedAt: string | null
  reviewBranchName: string
}

interface PreparePullRequestReviewSessionInputData {
  projectId?: string | null
  reference: string
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  sessionName?: string
}

interface PullRequestReviewSessionResultData {
  workspace: WorkspaceData
  pullRequest: WorkspacePullRequestData
  session: SessionSummaryData
}

interface PullRequestReviewWorkspaceResultData {
  workspace: WorkspaceData
  pullRequest: WorkspacePullRequestData
  created: boolean
  refreshed: boolean
}

type ReviewNoteModeData = 'working-tree' | 'base-branch'
type ReviewNoteStateData = 'draft' | 'sent' | 'resolved'

interface ReviewNoteData {
  id: string
  sessionId: string
  workspaceId: string | null
  filePath: string
  mode: ReviewNoteModeData
  oldStartLine: number | null
  oldEndLine: number | null
  newStartLine: number | null
  newEndLine: number | null
  hunkHeader: string | null
  selectedDiff: string
  body: string
  state: ReviewNoteStateData
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

interface CreateReviewNoteInputData {
  sessionId: string
  workspaceId?: string | null
  filePath: string
  mode: ReviewNoteModeData
  oldStartLine?: number | null
  oldEndLine?: number | null
  newStartLine?: number | null
  newEndLine?: number | null
  hunkHeader?: string | null
  selectedDiff: string
  body: string
}

interface UpdateReviewNoteInputData {
  body?: string
  state?: ReviewNoteStateData
}

interface PreviewReviewNotePacketInputData {
  sessionId: string
  noteIds?: string[]
}

interface SendReviewNotePacketInputData {
  sessionId: string
  noteIds?: string[]
}

interface ReviewNotePacketPreviewData {
  noteCount: number
  text: string
}

interface ReviewNotePacketSendResultData extends ReviewNotePacketPreviewData {
  sentNotes: ReviewNoteData[]
}

interface CreateWorkspaceInput {
  projectId: string
  branchName: string
  baseBranch?: string | null
}

interface ArchiveWorkspaceInputData {
  id: string
  removeWorktree?: boolean
}

type SessionStatus = 'idle' | 'running' | 'completed' | 'failed'
type AttentionState =
  | 'none'
  | 'needs-input'
  | 'needs-approval'
  | 'finished'
  | 'failed'
type ReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'max'
  | 'xhigh'

type SessionPermissionPresetData = 'ask' | 'yolo' | 'custom'
type CodexApprovalPolicyData = 'untrusted' | 'on-request' | 'never'
type CodexSandboxModeData =
  | 'read-only'
  | 'workspace-write'
  | 'danger-full-access'
type ClaudeCodePermissionModeData =
  | 'default'
  | 'acceptEdits'
  | 'auto'
  | 'dontAsk'
  | 'plan'
  | 'bypassPermissions'

interface SessionPermissionConfigData {
  preset: SessionPermissionPresetData
  codex?: {
    approvalPolicy: CodexApprovalPolicyData
    sandbox: CodexSandboxModeData
  }
  claudeCode?: {
    permissionMode: ClaudeCodePermissionModeData
  }
}
type ActivitySignal =
  | null
  | 'streaming'
  | 'thinking'
  | 'compacting'
  | 'waiting-approval'
  | `tool:${string}`
type MidRunInputMode = 'normal' | 'answer' | 'follow-up' | 'steer' | 'interrupt'
type ContextWindowSource = 'provider' | 'estimated'
type SessionContextWindow =
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
type NeedsYouDisposition = 'snoozed' | 'acknowledged'
type NeedsYouDismissals = Record<
  string,
  {
    updatedAt: string
    disposition: NeedsYouDisposition
  }
>

interface ProviderEffortOption {
  id: ReasoningEffort
  label: string
  description?: string
}

interface ProviderModelOption {
  id: string
  label: string
  description?: string
  contextWindowTokens?: number | null
  defaultEffort: ReasoningEffort | null
  effortOptions: ProviderEffortOption[]
  inputModalities?: Array<'text' | 'image'>
  source?: 'pi-models-json' | 'provider'
}

type AttachmentKind = 'image' | 'pdf' | 'text'

interface AttachmentData {
  id: string
  sessionId: string
  kind: AttachmentKind
  mimeType: string
  filename: string
  sizeBytes: number
  storagePath: string
  thumbnailPath: string | null
  textPreview: string | null
  createdAt: string
}

interface ProviderAttachmentCapability {
  supportsImage: boolean
  supportsPdf: boolean
  supportsText: boolean
  maxImageBytes: number
  maxPdfBytes: number
  maxTextBytes: number
  maxTotalBytes: number
}

interface ProviderSkillsCapability {
  catalog: SkillCatalogSource
  invocation: SkillInvocationSupport
  activationConfirmation: SkillActivationConfirmation
}

interface ProviderMidRunInputCapability {
  supportsAnswer: boolean
  supportsNativeFollowUp: boolean
  supportsAppQueuedFollowUp: boolean
  supportsSteer: boolean
  supportsInterrupt: boolean
  defaultRunningMode: Extract<MidRunInputMode, 'follow-up' | 'steer'> | null
  notes?: string
}

type ProviderInteractionRequestKind =
  | 'text'
  | 'choice'
  | 'plan'
  | 'form'
  | 'url'

type ProviderPassiveInteractionKind = 'todos' | 'task' | 'generated-image'

interface ProviderInteractionCapability {
  inputRequests: ProviderInteractionRequestKind[]
  passiveUpdates: ProviderPassiveInteractionKind[]
  unavailable: string[]
  notes?: string
}

type ProviderConfigOptionSource = 'provider' | 'fallback'
type ProviderConfigPersistence = 'session' | 'provider-managed' | 'unsupported'

interface ProviderConfigSelectOption {
  id: string
  label: string
  description?: string
}

interface ProviderConfigOption {
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

type ProviderTelemetryAvailability = 'available' | 'partial' | 'unavailable'

interface ProviderTelemetryCapability {
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

interface ProviderSettingsHelpItem {
  label: string
  value: string
}

interface ProviderSettingsLink {
  label: string
  url: string
}

interface ProviderSettingsInfo {
  help: ProviderSettingsHelpItem[]
  links?: ProviderSettingsLink[]
}

interface AttachmentIngestRejection {
  filename: string
  reason: string
}

interface AttachmentIngestResult {
  attachments: AttachmentData[]
  rejections: AttachmentIngestRejection[]
}

interface AttachmentIngestFileInput {
  name: string
  bytes: Uint8Array | ArrayBuffer | number[]
  mimeType?: string
}

interface SendSessionMessageInput {
  text: string
  attachmentIds?: string[]
  skillSelections?: SkillSelection[]
  deliveryMode?: MidRunInputMode
  interactionResponse?: InteractionResponseData
  contextItemIds?: string[]
}

interface InteractionChoiceOptionData {
  label: string
  description?: string
  preview?: string
}

interface InteractionQuestionData {
  id: string
  question: string
  header: string
  options: InteractionChoiceOptionData[]
  multiSelect: boolean
}

type InteractionFormFieldTypeData = 'string' | 'number' | 'boolean'

interface InteractionFormFieldData {
  id: string
  label: string
  description?: string
  type: InteractionFormFieldTypeData
  required: boolean
  defaultValue?: string | number | boolean
  multiline?: boolean
}

type InteractionRequestData =
  | {
      kind: 'text'
      prompt: string
    }
  | {
      kind: 'choice'
      questions: InteractionQuestionData[]
    }
  | {
      kind: 'plan'
      plan: string
      planPath?: string
      allowedPrompts?: string[]
    }
  | {
      kind: 'form'
      title: string
      message: string
      fields: InteractionFormFieldData[]
    }
  | {
      kind: 'url'
      title: string
      message: string
      url: string
    }

interface InteractionChoiceResponseData {
  kind: 'choice'
  answers: Array<{
    questionId: string
    values: string[]
  }>
}

interface InteractionPlanResponseData {
  kind: 'plan'
  decision: 'approve' | 'reject'
  message?: string
}

interface InteractionFormResponseData {
  kind: 'form'
  action: 'accept' | 'decline'
  values: Record<string, string | number | boolean>
}

interface InteractionUrlResponseData {
  kind: 'url'
  action: 'accept' | 'decline'
}

type InteractionResponseData =
  | InteractionChoiceResponseData
  | InteractionPlanResponseData
  | InteractionFormResponseData
  | InteractionUrlResponseData

type ConversationItemKind =
  | 'message'
  | 'thinking'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'input-request'
  | 'note'

type ConversationItemState = 'streaming' | 'complete' | 'error'

interface ConversationItemDataBase {
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

type ConversationItemData =
  | (ConversationItemDataBase & {
      kind: 'message'
      actor: 'user' | 'assistant'
      text: string
      attachmentIds?: string[]
      skillSelections?: SkillSelection[]
      deliveryMode?: 'steer' | 'follow-up'
    })
  | (ConversationItemDataBase & {
      kind: 'thinking'
      actor: 'assistant'
      text: string
    })
  | (ConversationItemDataBase & {
      kind: 'tool-call'
      toolName: string
      inputText: string
    })
  | (ConversationItemDataBase & {
      kind: 'tool-result'
      toolName: string | null
      relatedItemId: string | null
      outputText: string
    })
  | (ConversationItemDataBase & {
      kind: 'approval-request'
      description: string
    })
  | (ConversationItemDataBase & {
      kind: 'input-request'
      prompt: string
      request?: InteractionRequestData
    })
  | (ConversationItemDataBase & {
      kind: 'note'
      level: 'info' | 'warning' | 'error'
      text: string
    })

interface ConversationPatchEventData {
  sessionId: string
  op: 'add' | 'patch'
  item: ConversationItemData
}

type QueuedInputStateData =
  | 'queued'
  | 'dispatching'
  | 'sent'
  | 'failed'
  | 'cancelled'

interface SessionQueuedInputData {
  id: string
  sessionId: string
  deliveryMode: Extract<MidRunInputMode, 'follow-up' | 'steer' | 'interrupt'>
  state: QueuedInputStateData
  text: string
  attachmentIds: string[]
  skillSelections: SkillSelection[]
  providerRequestId: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

interface QueuedInputPatchEventData {
  sessionId: string
  op: 'add' | 'patch'
  item: SessionQueuedInputData
}

type TurnStatusData = 'running' | 'completed' | 'errored'

type TurnFileChangeStatusData = 'added' | 'modified' | 'deleted' | 'renamed'

interface TurnData {
  id: string
  sessionId: string
  sequence: number
  startedAt: string
  endedAt: string | null
  status: TurnStatusData
  summary: string | null
}

interface TurnFileChangeData {
  id: string
  sessionId: string
  turnId: string
  filePath: string
  oldPath: string | null
  status: TurnFileChangeStatusData
  additions: number
  deletions: number
  diff: string
  createdAt: string
}

type TurnDeltaData =
  | { kind: 'turn.add'; sessionId: string; turn: TurnData }
  | {
      kind: 'turn.fileChanges.add'
      sessionId: string
      turnId: string
      fileChanges: TurnFileChangeData[]
    }

type SessionContextKindData = 'project' | 'global'

type AttentionRequestKindData =
  | 'approval'
  | 'question'
  | 'plan'
  | 'form'
  | 'url'
  | 'input'

interface SessionSummaryData {
  id: string
  contextKind: SessionContextKindData
  projectId: string | null
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  serviceTier?: string | null
  permissionConfig?: SessionPermissionConfigData
  name: string
  status: SessionStatus
  attention: AttentionState
  attentionRequestKind?: AttentionRequestKindData | null
  activity: ActivitySignal
  contextWindow: SessionContextWindow | null
  workingDirectory: string
  archivedAt: string | null
  parentSessionId: string | null
  forkStrategy: 'full' | 'summary' | null
  primarySurface: 'conversation' | 'terminal'
  executionHost?: 'local' | 'remote'
  continuationToken: string | null
  lastSequence: number
  createdAt: string
  updatedAt: string
}

interface CreateSessionInput {
  contextKind?: SessionContextKindData
  projectId?: string | null
  workspaceId?: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  serviceTier?: string | null
  permissionConfig?: SessionPermissionConfigData
  name: string
  primarySurface?: 'conversation' | 'terminal'
  executionHost?: 'local' | 'remote'
}

interface ProviderInfo {
  id: string
  name: string
  vendorLabel: string
  kind: 'conversation' | 'shell'
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

interface ProviderStatusInfo {
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

interface ProviderInstallInfo {
  manager: 'npm' | 'homebrew' | 'self' | 'unknown'
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

interface ProviderRuntimeInfo {
  appNodeVersion: string
  electronVersion: string | null
  appVersion: string
  isPackaged: boolean
  platform: NodeJS.Platform
  arch: string
}

type ProviderUpdateStatus = 'current' | 'outdated' | 'unknown'
type ProviderUpdateCapability = 'automatic' | 'manual'
type ProviderUpdateStrategy =
  | 'npm-global'
  | 'provider-self-update'
  | 'brew-upgrade'
  | null

interface ProviderUpdateInfo {
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

interface ProviderUpdateResult {
  ok: boolean
  providerId: string
  command: string
  stdout: string
  stderr: string
  error: string | null
}

type ProviderQuotaWindowKindData = 'five-hour' | 'weekly' | 'other'
type ProviderQuotaWindowDisplayModeData = 'remaining-quota' | 'observed-usage'
type ProviderQuotaSourceData =
  | 'provider-api'
  | 'provider-event'
  | 'local-usage-log'

interface ProviderQuotaWindowData {
  kind: ProviderQuotaWindowKindData
  label: string
  usedPercent: number
  remainingPercent: number
  windowMinutes: number | null
  resetsAt: string | null
  displayMode?: ProviderQuotaWindowDisplayModeData
  valueLabel?: string
  resetLabel?: string
}

interface ProviderCreditsQuotaData {
  hasCredits: boolean
  unlimited: boolean
  balance: string | null
}

type ProviderQuotaSnapshotData =
  | {
      providerId: 'codex' | 'claude-code' | 'cursor' | 'antigravity'
      status: 'available'
      source: ProviderQuotaSourceData
      planType: string | null
      windows: ProviderQuotaWindowData[]
      credits: ProviderCreditsQuotaData | null
      limitReachedType: string | null
      lastCheckedAt: string
      stale: boolean
    }
  | {
      providerId: 'codex' | 'claude-code' | 'cursor' | 'antigravity'
      status: 'unavailable'
      source: ProviderQuotaSourceData | 'manual'
      reason: string
      usageUrl?: string
      lastCheckedAt: string
      stale: boolean
    }

type FeedbackPriorityData = 'low' | 'medium' | 'high'

interface FeedbackContextData {
  activeProjectId?: string | null
  activeProjectName?: string | null
  activeSessionId?: string | null
  appUrl?: string | null
}

interface SubmitFeedbackInputData {
  title: string
  description: string
  priority: FeedbackPriorityData
  contact?: string | null
  context?: FeedbackContextData
}

interface FeedbackSubmissionResultData {
  id: string
  acceptedAt: string
}

interface SystemInfo {
  platform: NodeJS.Platform
  prefersReducedTransparency: boolean
}

type ProjectContextReinjectModeData = 'boot' | 'every-turn'

interface ProjectContextItemData {
  id: string
  projectId: string
  label: string | null
  body: string
  reinjectMode: ProjectContextReinjectModeData
  createdAt: string
  updatedAt: string
}

interface CreateProjectContextItemInputData {
  projectId: string
  label?: string | null
  body: string
  reinjectMode: ProjectContextReinjectModeData
}

interface UpdateProjectContextItemInputData {
  label?: string | null
  body?: string
  reinjectMode?: ProjectContextReinjectModeData
}

type ProjectScriptRunStatusData =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'stopped'

type ProjectScriptIconIdData =
  | 'play'
  | 'check'
  | 'build'
  | 'test'
  | 'wrench'
  | 'bug'

interface ProjectScriptData {
  id: string
  projectId: string
  name: string
  command: string
  icon: ProjectScriptIconIdData
  cwd: string | null
  createdAt: string
  updatedAt: string
}

interface ProjectScriptRunData {
  id: string
  scriptId: string
  projectId: string
  command: string
  cwd: string
  status: ProjectScriptRunStatusData
  startedAt: string
  endedAt: string | null
  exitCode: number | null
  signal: string | null
  errorMessage: string | null
  stdout: string
  stderr: string
}

interface ProjectScriptRunOutputData {
  runId: string
  stream: 'stdout' | 'stderr'
  text: string
  sequence: number
  emittedAt: string
}

interface CreateProjectScriptInputData {
  projectId: string
  name: string
  command: string
  icon?: ProjectScriptIconIdData
  cwd?: string | null
}

interface UpdateProjectScriptInputData {
  name?: string
  command?: string
  icon?: ProjectScriptIconIdData
  cwd?: string | null
}

interface RunProjectScriptInputData {
  cwd?: string | null
}

type AnalyticsRangePresetData = '7d' | '30d' | '90d' | 'all'

interface AnalyticsRangeData {
  preset: AnalyticsRangePresetData
  startDate: string | null
  endDate: string
}

interface AnalyticsTotalsData {
  userMessages: number
  assistantMessages: number
  userWords: number
  assistantWords: number
  sessionsCreated: number
  turnsCompleted: number
  filesChanged: number
  linesAdded: number
  linesDeleted: number
  approvalRequests: number
  inputRequests: number
  attachmentsSent: number
  toolCalls: number
  failedSessions: number
}

interface AnalyticsStreaksData {
  current: number
  longest: number
  activeDays: string[]
}

interface DailyActivityPointData {
  date: string
  userMessages: number
  assistantMessages: number
  userWords: number
  assistantWords: number
  sessionsCreated: number
  turnsCompleted: number
  filesChanged: number
}

interface ProviderUsagePointData {
  providerId: string
  providerName: string
  sessionsCreated: number
  turnsCompleted: number
  userMessages: number
  assistantMessages: number
}

interface ModelUsagePointData {
  modelId: string
  modelLabel: string
  sessionsCreated: number
  turnsCompleted: number
  userMessages: number
  assistantMessages: number
  providerId: string | null
  providerName: string
}

interface ProjectUsagePointData {
  projectId: string
  projectName: string
  sessionsCreated: number
  turnsCompleted: number
  userMessages: number
  assistantMessages: number
}

interface WeekdayHourActivityPointData {
  weekday: number
  hour: number
  count: number
}

interface ConversationBalancePointData {
  date: string
  userWords: number
  assistantWords: number
}

type WorkStyleInteractionShapeData =
  | 'none'
  | 'mostly-ask-review'
  | 'mostly-implementation'
  | 'mostly-debugging'
  | 'mixed-exploration-implementation'

type WorkStyleSessionSizeBucketData =
  | 'none'
  | 'quick-check'
  | 'normal-task'
  | 'long-running'

interface DeterministicWorkProfileData {
  mostUsedProvider: ProviderUsagePointData | null
  mostActiveProject: ProjectUsagePointData | null
  peakActivity: WeekdayHourActivityPointData | null
  sessionSizeBucket: WorkStyleSessionSizeBucketData
  interactionShape: WorkStyleInteractionShapeData
  summary: string
}

interface GeneratedWorkProfileSnapshotPayloadData {
  version: 1
  title: string
  summary: string
  themes: Array<{ label: string; description: string }>
  caveats: string[]
}

interface GeneratedWorkProfileSnapshotData {
  id: string
  rangePreset: AnalyticsRangePresetData
  rangeStartDate: string | null
  rangeEndDate: string
  providerId: string | null
  model: string | null
  payload: GeneratedWorkProfileSnapshotPayloadData
  createdAt: string
}

interface AnalyticsOverviewData {
  range: AnalyticsRangeData
  totals: AnalyticsTotalsData
  streaks: AnalyticsStreaksData
  dailyActivity: DailyActivityPointData[]
  providerUsage: ProviderUsagePointData[]
  modelUsage: ModelUsagePointData[]
  projectUsage: ProjectUsagePointData[]
  weekdayHourActivity: WeekdayHourActivityPointData[]
  conversationBalance: ConversationBalancePointData[]
  deterministicProfile: DeterministicWorkProfileData
  generatedProfile: GeneratedWorkProfileSnapshotData | null
}

interface ElectronAPI {
  system: {
    getInfo: () => SystemInfo
  }
  project: {
    create: (input: CreateProjectInput) => Promise<ProjectData>
    clone: (input: CloneProjectInput) => Promise<ProjectData>
    getAll: () => Promise<ProjectData[]>
    getById: (id: string) => Promise<ProjectData | null>
    delete: (id: string) => Promise<void>
    getActive: () => Promise<ProjectData | null>
    setActive: (id: string) => Promise<void>
    updateSettings: (
      id: string,
      settings: ProjectSettings,
    ) => Promise<ProjectData>
  }
  projectContext: {
    list: (projectId: string) => Promise<ProjectContextItemData[]>
    create: (
      input: CreateProjectContextItemInputData,
    ) => Promise<ProjectContextItemData>
    update: (
      id: string,
      patch: UpdateProjectContextItemInputData,
    ) => Promise<ProjectContextItemData>
    delete: (id: string) => Promise<void>
    attachToSession: (sessionId: string, itemIds: string[]) => Promise<void>
    listForSession: (sessionId: string) => Promise<ProjectContextItemData[]>
  }
  projectScripts: {
    list: (projectId: string) => Promise<ProjectScriptData[]>
    create: (input: CreateProjectScriptInputData) => Promise<ProjectScriptData>
    update: (
      id: string,
      input: UpdateProjectScriptInputData,
    ) => Promise<ProjectScriptData>
    delete: (id: string) => Promise<void>
    listRuns: (projectId: string) => Promise<ProjectScriptRunData[]>
    listActiveRuns: () => Promise<ProjectScriptRunData[]>
    getRun: (runId: string) => Promise<ProjectScriptRunData | null>
    run: (
      scriptId: string,
      input?: RunProjectScriptInputData,
    ) => Promise<ProjectScriptRunData>
    stop: (runId: string) => Promise<ProjectScriptRunData>
    onRunUpdated: (callback: (run: ProjectScriptRunData) => void) => () => void
    onRunOutput: (
      callback: (output: ProjectScriptRunOutputData) => void,
    ) => () => void
  }
  space: {
    list: () => Promise<SpaceData[]>
    getById: (id: string) => Promise<SpaceData | null>
    create: (input: CreateSpaceInputData) => Promise<SpaceData>
    update: (id: string, input: UpdateSpaceInputData) => Promise<SpaceData>
    archive: (id: string) => Promise<SpaceData>
    unarchive: (id: string) => Promise<SpaceData>
    delete: (id: string) => Promise<void>
    listAttempts: (spaceId: string) => Promise<SpaceAttemptData[]>
    listAttemptsForSession: (sessionId: string) => Promise<SpaceAttemptData[]>
    linkAttempt: (input: LinkSpaceAttemptInputData) => Promise<SpaceAttemptData>
    updateAttempt: (
      id: string,
      input: UpdateSpaceAttemptInputData,
    ) => Promise<SpaceAttemptData>
    unlinkAttempt: (id: string) => Promise<void>
    setPrimaryAttempt: (
      spaceId: string,
      attemptId: string,
    ) => Promise<SpaceAttemptData>
    listArtifacts: (spaceId: string) => Promise<SpaceArtifactData[]>
    addArtifact: (
      input: CreateSpaceArtifactInputData,
    ) => Promise<SpaceArtifactData>
    addArtifactsFromPaths: (
      spaceId: string,
      paths: string[],
    ) => Promise<SpaceArtifactData[]>
    updateArtifact: (
      id: string,
      input: UpdateSpaceArtifactInputData,
    ) => Promise<SpaceArtifactData>
    deleteArtifact: (id: string) => Promise<void>
    listSources: (spaceId: string) => Promise<SpaceSourceData[]>
    addSourcesFromPaths: (
      spaceId: string,
      paths: string[],
    ) => Promise<SpaceSourceData[]>
    deleteSource: (id: string) => Promise<void>
    showSourceOpenDialog: () => Promise<string[] | null>
    showArtifactOpenDialog: () => Promise<string[] | null>
    synthesize: (
      spaceId: string,
      requestId?: string,
    ) => Promise<SpaceSynthesisResultData>
  }
  dialog: {
    selectDirectory: () => Promise<string | null>
    selectCloneParentDirectory: () => Promise<string | null>
  }
  projectOpen?: {
    listApps: () => Promise<ProjectOpenAppData[]>
    open: (input: ProjectOpenRequestData) => Promise<void>
  }
  workspace: {
    create: (input: CreateWorkspaceInput) => Promise<WorkspaceData>
    getByProjectId: (projectId: string) => Promise<WorkspaceData[]>
    getAll: () => Promise<WorkspaceData[]>
    archive: (input: ArchiveWorkspaceInputData) => Promise<WorkspaceData>
    unarchive: (id: string) => Promise<WorkspaceData>
    removeWorktree: (id: string) => Promise<WorkspaceData>
    syncEnvFiles: (id: string) => Promise<WorkspaceData>
    delete: (id: string) => Promise<void>
  }
  pullRequest: {
    getByWorkspaceId: (
      workspaceId: string,
    ) => Promise<WorkspacePullRequestData | null>
    listByProjectId: (projectId: string) => Promise<WorkspacePullRequestData[]>
    refreshForSession: (
      sessionId: string,
    ) => Promise<WorkspacePullRequestData | null>
    previewReview: (input: {
      projectId?: string | null
      reference: string
    }) => Promise<PullRequestReviewPreviewData>
    prepareReviewSession: (
      input: PreparePullRequestReviewSessionInputData,
    ) => Promise<PullRequestReviewSessionResultData>
    materializeReviewWorkspace: (input: {
      projectId?: string | null
      reference: string
    }) => Promise<PullRequestReviewWorkspaceResultData>
  }
  reviewNotes: {
    listBySession: (sessionId: string) => Promise<ReviewNoteData[]>
    create: (input: CreateReviewNoteInputData) => Promise<ReviewNoteData>
    update: (
      id: string,
      patch: UpdateReviewNoteInputData,
    ) => Promise<ReviewNoteData>
    delete: (id: string) => Promise<void>
    previewPacket: (
      input: PreviewReviewNotePacketInputData,
    ) => Promise<ReviewNotePacketPreviewData>
    sendPacket: (
      input: SendReviewNotePacketInputData,
    ) => Promise<ReviewNotePacketSendResultData>
  }
  git: {
    getBranches: (repoPath: string) => Promise<string[]>
    getAllBranches: (repoPath: string) => Promise<string[]>
    getCurrentBranch: (repoPath: string) => Promise<string>
    getBranchOutputFacts: (repoPath: string) => Promise<BranchOutputFactsData>
    getStatus: (repoPath: string) => Promise<GitStatusEntryData[]>
    getDiff: (repoPath: string, filePath?: string) => Promise<string>
    getBaseBranchStatus: (
      sessionId: string,
    ) => Promise<BaseBranchDiffSummaryData>
    getBaseBranchDiff: (sessionId: string, filePath: string) => Promise<string>
  }
  codeReview: {
    listTargets: (
      input: CodeReviewListTargetsRequestData,
    ) => Promise<CodeReviewTargetData[]>
    getSummary: (
      input: CodeReviewSummaryRequestData,
    ) => Promise<CodeReviewSummaryData>
    getFilePatch: (input: CodeReviewFilePatchRequestData) => Promise<string>
  }
  codeReviewGuide: {
    getGuide: (
      input: CodeReviewGuideLookupRequestData,
    ) => Promise<CodeReviewGuideData | null>
    generateGuide: (
      input: CodeReviewGuideGenerateRequestData,
    ) => Promise<CodeReviewGuideData>
    refreshGuide: (
      input: CodeReviewGuideGenerateRequestData,
    ) => Promise<CodeReviewGuideData>
    testRemoteDaemonConnection: () => Promise<RemoteCodeReviewDaemonConnectionResultData>
  }
  session: {
    create: (input: CreateSessionInput) => Promise<SessionSummaryData>
    getSummariesByProjectId: (
      projectId: string,
    ) => Promise<SessionSummaryData[]>
    getAllSummaries: () => Promise<SessionSummaryData[]>
    getGlobalSummaries: () => Promise<SessionSummaryData[]>
    getSummaryById: (id: string) => Promise<SessionSummaryData | null>
    getConversation: (id: string) => Promise<ConversationItemData[]>
    archive: (id: string) => Promise<void>
    unarchive: (id: string) => Promise<void>
    delete: (id: string) => Promise<void>
    start: (
      id: string,
      input: SendSessionMessageInput | string,
    ) => Promise<void>
    sendMessage: (
      id: string,
      input: SendSessionMessageInput | string,
    ) => Promise<void>
    approve: (id: string, providerApprovalId?: string) => Promise<void>
    deny: (id: string, providerApprovalId?: string) => Promise<void>
    stop: (id: string) => Promise<void>
    rename: (id: string, name: string) => Promise<void>
    regenerateName: (
      id: string,
      requestId?: string,
    ) => Promise<{ updated: boolean }>
    setPrimarySurface: (
      id: string,
      surface: 'conversation' | 'terminal',
    ) => Promise<SessionSummaryData>
    getNeedsYouDismissals: () => Promise<NeedsYouDismissals>
    setNeedsYouDismissals: (dismissals: NeedsYouDismissals) => Promise<void>
    getRecentIds: () => Promise<string[]>
    setRecentIds: (ids: string[]) => Promise<void>
    onSessionSummaryUpdate: (
      callback: (summary: SessionSummaryData) => void,
    ) => () => void
    onSessionConversationPatched: (
      callback: (event: ConversationPatchEventData) => void,
    ) => () => void
    getQueuedInputs: (sessionId: string) => Promise<SessionQueuedInputData[]>
    cancelQueuedInput: (id: string) => Promise<void>
    onSessionQueuedInputPatched: (
      callback: (event: QueuedInputPatchEventData) => void,
    ) => () => void
    forkPreviewSummary: (
      parentId: string,
      requestId?: string,
      summarizeWith?: unknown,
    ) => Promise<unknown>
    forkFull: (input: unknown) => Promise<SessionSummaryData>
    forkSummary: (input: unknown) => Promise<SessionSummaryData>
  }
  turns: {
    listForSession: (sessionId: string) => Promise<TurnData[]>
    getFileChanges: (turnId: string) => Promise<TurnFileChangeData[]>
    getFileDiff: (turnId: string, filePath: string) => Promise<string>
    onTurnDelta: (callback: (payload: TurnDeltaData) => void) => () => void
  }
  provider: {
    getAll: () => Promise<ProviderInfo[]>
    getAllAvailable: () => Promise<ProviderInfo[]>
    getStatuses: () => Promise<ProviderStatusInfo[]>
    getRuntimeInfo: () => Promise<ProviderRuntimeInfo>
    update: (providerId: string) => Promise<ProviderUpdateResult>
    onStatusesChanged: (
      callback: (statuses: ProviderStatusInfo[]) => void,
    ) => () => void
  }
  providerQuota: {
    list: (forceRefresh?: boolean) => Promise<ProviderQuotaSnapshotData[]>
  }
  mcp: {
    listByProjectId: (projectId: string) => Promise<ProjectMcpVisibility>
    listGlobal: () => Promise<ProjectMcpVisibility>
  }
  skills: {
    listByProjectId: (
      projectId: string,
      options?: SkillCatalogOptions,
    ) => Promise<ProjectSkillCatalog>
    listGlobal: (options?: SkillCatalogOptions) => Promise<ProjectSkillCatalog>
    listProviderIds: (projectId: string) => Promise<SkillProviderListing>
    listProvider: (
      projectId: string,
      providerId: SkillProviderId,
      options?: SkillCatalogOptions,
    ) => Promise<ProviderSkillCatalog | null>
    readDetails: (input: SkillDetailsRequest) => Promise<SkillDetails>
    reveal: (input: SkillDetailsRequest) => Promise<void>
    openPath: (input: SkillDetailsRequest) => Promise<void>
  }
  prompts: {
    listByProjectId: (
      projectId: string,
      options?: PromptLibraryOptions,
    ) => Promise<PromptLibraryCatalog>
    listGlobal: (
      options?: PromptLibraryOptions,
    ) => Promise<PromptLibraryCatalog>
    readDetails: (
      input: PromptLibraryDetailsRequest,
    ) => Promise<PromptLibraryDetails>
    create: (input: CreatePromptLibraryInput) => Promise<PromptLibraryEntry>
    update: (input: UpdatePromptLibraryInput) => Promise<PromptLibraryEntry>
    delete: (input: DeletePromptLibraryInput) => Promise<void>
  }
  feedback: {
    submit: (
      input: SubmitFeedbackInputData,
    ) => Promise<FeedbackSubmissionResultData>
  }
  attachments: {
    ingestFiles: (
      sessionId: string,
      files: AttachmentIngestFileInput[],
    ) => Promise<AttachmentIngestResult>
    ingestFromOpenDialog: (
      sessionId: string,
    ) => Promise<AttachmentIngestResult | null>
    getForSession: (sessionId: string) => Promise<AttachmentData[]>
    getById: (id: string) => Promise<AttachmentData | null>
    readBytes: (id: string) => Promise<Uint8Array>
    delete: (id: string) => Promise<void>
  }
  appSettings: {
    get: () => Promise<AppSettingsData>
    set: (input: AppSettingsInputData) => Promise<AppSettingsData>
    onUpdated: (callback: (settings: AppSettingsData) => void) => () => void
  }
  credentials: {
    openRouter: {
      getStatus: () => Promise<OpenRouterCredentialStatusData>
      setToken: (token: string) => Promise<OpenRouterCredentialStatusData>
      deleteToken: () => Promise<OpenRouterCredentialStatusData>
    }
    guidedReviewDaemon: {
      getStatus: () => Promise<GuidedReviewDaemonCredentialStatusData>
      setToken: (
        token: string,
      ) => Promise<GuidedReviewDaemonCredentialStatusData>
      deleteToken: () => Promise<GuidedReviewDaemonCredentialStatusData>
    }
    executionHostDaemon: {
      getStatus: () => Promise<ExecutionHostDaemonCredentialStatusData>
      setToken: (
        token: string,
      ) => Promise<ExecutionHostDaemonCredentialStatusData>
      deleteToken: () => Promise<ExecutionHostDaemonCredentialStatusData>
    }
  }
  executionHost: {
    testRemoteConnection: () => Promise<RemoteExecutionHostConnectionResultData>
    getSessionWorkspace: (
      sessionId: string,
    ) => Promise<RemoteSessionWorkspaceResultData>
  }
  analytics: {
    getOverview: (
      rangePreset: AnalyticsRangePresetData,
    ) => Promise<AnalyticsOverviewData>
    generateWorkProfile: (input: {
      rangePreset: AnalyticsRangePresetData
      providerId: string
      model: string | null
    }) => Promise<GeneratedWorkProfileSnapshotData>
    deleteWorkProfileSnapshot: (id: string) => Promise<void>
  }
  notifications: {
    getPrefs: () => Promise<NotificationPrefsData>
    setPrefs: (input: NotificationPrefsData) => Promise<NotificationPrefsData>
    testFire: (severity: NotificationSeverityData) => Promise<void>
    setActiveSession: (sessionId: string | null) => Promise<void>
    onPrefsUpdated: (
      callback: (prefs: NotificationPrefsData) => void,
    ) => () => void
    onShowToast: (
      callback: (payload: NotificationDispatchPayloadData) => void,
    ) => () => void
    onPlaySound: (
      callback: (payload: NotificationDispatchPayloadData) => void,
    ) => () => void
    onFocusSession: (callback: (sessionId: string) => void) => () => void
    onClearUnread: (callback: () => void) => () => void
  }
  taskProgress: {
    subscribe: (callback: (event: TaskProgressEvent) => void) => () => void
  }
  providerDebug: {
    subscribe: (callback: (entry: ProviderDebugEntry) => void) => () => void
    list: (sessionId: string) => Promise<ProviderDebugEntry[]>
    openFolder: () => Promise<boolean>
  }
  localModelTunnel: {
    getSnapshot: () => Promise<LocalModelTunnelSnapshotData>
    start: (profileId: string) => Promise<LocalModelTunnelSnapshotData>
    stop: (profileId: string) => Promise<LocalModelTunnelSnapshotData>
    restart: (profileId: string) => Promise<LocalModelTunnelSnapshotData>
    createProfile: (
      input: LocalModelTunnelProfileInputData,
    ) => Promise<LocalModelTunnelSnapshotData>
    updateProfile: (
      profileId: string,
      input: LocalModelTunnelProfileInputData,
    ) => Promise<LocalModelTunnelSnapshotData>
    deleteProfile: (profileId: string) => Promise<LocalModelTunnelSnapshotData>
    onChanged: (
      callback: (snapshot: LocalModelTunnelSnapshotData) => void,
    ) => () => void
  }
  terminal: {
    create: (input: {
      sessionId: string
      cwd: string
      cols: number
      rows: number
    }) => Promise<{
      id: string
      pid: number
      shell: string
      initialBuffer: string
    }>
    attach: (id: string) => Promise<{ initialBuffer: string }>
    write: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    dispose: (id: string) => Promise<void>
    getForegroundProcess: (
      id: string,
    ) => Promise<{ pid: number; name: string } | null>
    onData: (id: string, callback: (data: string) => void) => () => void
    onExit: (
      id: string,
      callback: (payload: { exitCode: number; signal: number | null }) => void,
    ) => () => void
    onIdle: (callback: (payload: unknown) => void) => () => void
  }
  terminalLayout: {
    get: (sessionId: string) => Promise<unknown>
    save: (sessionId: string, tree: unknown) => Promise<void>
    clear: (sessionId: string) => Promise<void>
  }
  updates: {
    getStatus: () => Promise<UpdateStatusData>
    getAppVersion: () => Promise<string>
    getIsDev: () => Promise<boolean>
    getPrefs: () => Promise<UpdatePrefsData>
    setPrefs: (input: UpdatePrefsData) => Promise<UpdatePrefsData>
    check: () => Promise<UpdateStatusData>
    download: () => Promise<UpdateStatusData>
    install: () => Promise<UpdateStatusData>
    openReleaseNotes: () => Promise<boolean>
    onStatusChanged: (
      callback: (status: UpdateStatusData) => void,
    ) => () => void
  }
}

type UpdateStatusData =
  | {
      phase: 'idle'
      lastChecked: string | null
      lastError: string | null
    }
  | { phase: 'checking'; startedAt: string }
  | {
      phase: 'available'
      version: string
      releaseNotesUrl: string
      detectedAt: string
    }
  | {
      phase: 'downloading'
      version: string
      percent: number
      bytesPerSecond: number
    }
  | { phase: 'downloaded'; version: string; releaseNotesUrl: string }
  | { phase: 'not-available'; currentVersion: string; lastChecked: string }
  | { phase: 'error'; message: string; lastChecked: string | null }

type TaskProgressOutcome = 'ok' | 'error' | 'timeout'

type TaskProgressEvent =
  | { requestId: string; kind: 'started'; at: number }
  | { requestId: string; kind: 'stdout-chunk'; at: number; bytes: number }
  | { requestId: string; kind: 'stderr-chunk'; at: number; bytes: number }
  | {
      requestId: string
      kind: 'settled'
      at: number
      outcome: TaskProgressOutcome
    }

type ProviderDebugChannel =
  | 'notification'
  | 'response'
  | 'request'
  | 'event'
  | 'stdout'
  | 'stderr'
  | 'lifecycle'

interface ProviderDebugEntry {
  sessionId: string
  providerId: string
  at: number
  direction: 'in' | 'out'
  channel: ProviderDebugChannel
  method?: string
  payload?: unknown
  bytes?: number
  note?: string
}

interface NotificationEventPrefsData {
  finished: boolean
  needsInput: boolean
  needsApproval: boolean
  errored: boolean
  terminalIdle: boolean
}

interface NotificationPrefsData {
  enabled: boolean
  toasts: boolean
  sounds: boolean
  system: boolean
  dockBadge: boolean
  dockBounce: boolean
  events: NotificationEventPrefsData
  suppressWhenFocused: boolean
}

type NotificationSeverityData = 'info' | 'critical'

type NotificationEventKindData =
  | 'agent.finished'
  | 'agent.needs_approval'
  | 'agent.needs_input'
  | 'agent.errored'
  | 'terminal.idle'

type NotificationChannelData =
  | 'inline-pulse'
  | 'toast'
  | 'sound-soft'
  | 'sound-alert'
  | 'dock-badge'
  | 'dock-bounce-info'
  | 'dock-bounce-crit'
  | 'flash-frame'
  | 'system-notification'

interface NotificationEventData {
  id: string
  kind: NotificationEventKindData
  sessionId: string
  sessionName: string
  projectName: string
  terminalId?: string | null
  terminalProcessName?: string | null
  firedAt: number
}

interface FormattedNotificationData {
  title: string
  body: string
  subtitle?: string
}

interface NotificationDispatchPayloadData {
  channel: NotificationChannelData
  event: NotificationEventData
  formatted: FormattedNotificationData
}

interface OnboardingPrefsData {
  notificationsCardDismissed: boolean
}

interface UpdatePrefsData {
  backgroundCheckEnabled: boolean
}

interface DebugLoggingPrefsData {
  enabled: boolean
}

interface FavoriteModelRefData {
  providerId: string
  modelId: string
}

interface CommandCenterShortcutPrefsData {
  key: string
  shiftKey: boolean
  altKey: boolean
}

interface AppSettingsData {
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId: ReasoningEffort | null
  namingModelByProvider: Record<string, string>
  extractionModelByProvider: Record<string, string>
  guidedReviewModelByProvider: Record<string, string>
  commandCenterShortcut: CommandCenterShortcutPrefsData
  guidedReviewBackend: 'local' | 'remote'
  guidedReviewRemoteBaseUrl: string | null
  executionHostRemoteBaseUrl: string | null
  notifications: NotificationPrefsData
  onboarding: OnboardingPrefsData
  updates: UpdatePrefsData
  debugLogging: DebugLoggingPrefsData
  piModelVisibility: {
    additionalModelIds: string[]
  }
  favoriteModels: {
    items: FavoriteModelRefData[]
  }
}

type AppSettingsInputData = Omit<
  AppSettingsData,
  | 'namingModelByProvider'
  | 'extractionModelByProvider'
  | 'guidedReviewModelByProvider'
  | 'commandCenterShortcut'
  | 'guidedReviewBackend'
  | 'guidedReviewRemoteBaseUrl'
  | 'executionHostRemoteBaseUrl'
  | 'notifications'
  | 'onboarding'
  | 'updates'
  | 'debugLogging'
  | 'piModelVisibility'
  | 'favoriteModels'
> & {
  namingModelByProvider?: Record<string, string>
  extractionModelByProvider?: Record<string, string>
  guidedReviewModelByProvider?: Record<string, string>
  commandCenterShortcut?: CommandCenterShortcutPrefsData
  guidedReviewBackend?: 'local' | 'remote'
  guidedReviewRemoteBaseUrl?: string | null
  executionHostRemoteBaseUrl?: string | null
  notifications?: NotificationPrefsData
  onboarding?: OnboardingPrefsData
  updates?: UpdatePrefsData
  debugLogging?: DebugLoggingPrefsData
  piModelVisibility?: {
    additionalModelIds: string[]
  }
  favoriteModels?: {
    items: FavoriteModelRefData[]
  }
}

type LocalModelTunnelStateData =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'external'
  | 'failed'

type LocalModelTunnelConnectionKindData = 'local-runtime' | 'ssh-tunnel'

type LocalModelTunnelProbeKindData = 'http' | 'tcp'

type LocalModelTunnelHealthStateData = 'unknown' | 'healthy' | 'unhealthy'

type LocalModelTunnelHealthFailureKindData =
  | 'invalid-url'
  | 'timeout'
  | 'connection-refused'
  | 'connection-reset'
  | 'network-error'
  | 'non-200'
  | 'invalid-json'
  | 'not-ollama-json'

interface LocalModelTunnelHealthStatusData {
  state: LocalModelTunnelHealthStateData
  probeKind: LocalModelTunnelProbeKindData | null
  checkedAt: string | null
  latencyMs: number | null
  statusCode: number | null
  modelCount: number | null
  modelNames: string[] | null
  isOllama: boolean | null
  failureKind: LocalModelTunnelHealthFailureKindData | null
  error: string | null
}

interface LocalModelTunnelRouteCandidateData {
  id: string
  label: string
  sshTarget: string
  useCustomLocalBindHost: boolean
  localBindHost: string
  localPort: number
  remoteHost: string
  remotePort: number
  healthCheckUrl: string
  connectTimeoutSeconds: number | null
}

interface LocalModelTunnelProfileData {
  id: string
  name: string
  connectionKind: LocalModelTunnelConnectionKindData
  sshTarget: string
  allowExternal: boolean
  autoStart: boolean
  useCustomLocalBindHost: boolean
  localBindHost: string
  localPort: number
  remoteHost: string
  remotePort: number
  healthCheckEnabled: boolean
  healthCheckUrl: string
  routeCandidates: LocalModelTunnelRouteCandidateData[]
  createdAt: string
  updatedAt: string
}

interface LocalModelTunnelProfileInputData {
  name?: string
  connectionKind?: LocalModelTunnelConnectionKindData
  sshTarget?: string
  allowExternal?: boolean
  autoStart?: boolean
  useCustomLocalBindHost?: boolean
  localBindHost?: string
  localPort?: number
  remoteHost?: string
  remotePort?: number
  healthCheckEnabled?: boolean
  healthCheckUrl?: string
  routeCandidates?: LocalModelTunnelRouteCandidateData[]
}

interface LocalModelTunnelDiagnosticData {
  label: string
  value: string
}

interface LocalModelTunnelRuntimeStatusData {
  profileId: string
  state: LocalModelTunnelStateData
  managed: boolean
  pid: number | null
  error: string | null
  lastCheckedAt: string | null
  health: LocalModelTunnelHealthStatusData
  activeRouteId: string | null
  activeRouteLabel: string | null
  diagnostics: LocalModelTunnelDiagnosticData[]
  commandPreview: string
}

interface LocalModelTunnelProfileWithStatusData {
  profile: LocalModelTunnelProfileData
  status: LocalModelTunnelRuntimeStatusData
}

interface LocalModelTunnelSnapshotData {
  profiles: LocalModelTunnelProfileWithStatusData[]
  updatedAt: string
}

interface OpenRouterCredentialStatusData {
  providerId: 'openrouter'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  error: string | null
}

interface GuidedReviewDaemonCredentialStatusData {
  providerId: 'guided-review-daemon'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  error: string | null
}

interface ExecutionHostDaemonCredentialStatusData {
  providerId: 'execution-host-daemon'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  error: string | null
}

type RemoteSessionWorkspaceResultData =
  | {
      ok: true
      info: {
        workspace: {
          repository: string
          branchName: string
          baseRef: string | null
        } | null
        prUrl: string | null
      }
    }
  | { ok: false; message: string }

interface RemoteExecutionHostConnectionResultData {
  ok: boolean
  state:
    | 'connected'
    | 'missing-base-url'
    | 'invalid-base-url'
    | 'missing-token'
    | 'unreachable'
    | 'auth-failed'
    | 'invalid-response'
    | 'daemon-error'
  baseUrl: string | null
  message: string
  providers: Array<{
    providerId: string
    name: string
    available: boolean
    authenticated: boolean
    supportsContinuation: boolean
    models: Array<{ id: string; label: string }>
  }> | null
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
