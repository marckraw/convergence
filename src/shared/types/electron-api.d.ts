import type { ProjectMcpVisibility } from './mcp.types'

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

interface ProjectSettings {
  workspaceCreation: WorkspaceCreationSettings
}

interface CreateProjectInput {
  repositoryPath: string
  name?: string
}

type InitiativeStatusData =
  | 'exploring'
  | 'planned'
  | 'implementing'
  | 'reviewing'
  | 'ready-to-merge'
  | 'merged'
  | 'released'
  | 'parked'
  | 'discarded'

type InitiativeAttentionData =
  | 'none'
  | 'needs-you'
  | 'needs-decision'
  | 'blocked'
  | 'stale'

type InitiativeAttemptRoleData =
  | 'seed'
  | 'exploration'
  | 'implementation'
  | 'review'
  | 'hardening'
  | 'docs'

type InitiativeOutputKindData =
  | 'pull-request'
  | 'branch'
  | 'commit-range'
  | 'release'
  | 'spec'
  | 'documentation'
  | 'migration-note'
  | 'external-issue'
  | 'other'

type InitiativeOutputStatusData =
  | 'planned'
  | 'in-progress'
  | 'ready'
  | 'merged'
  | 'released'
  | 'abandoned'

interface InitiativeData {
  id: string
  title: string
  status: InitiativeStatusData
  attention: InitiativeAttentionData
  currentUnderstanding: string
  createdAt: string
  updatedAt: string
}

interface InitiativeAttemptData {
  id: string
  initiativeId: string
  sessionId: string
  role: InitiativeAttemptRoleData
  isPrimary: boolean
  createdAt: string
}

interface InitiativeOutputData {
  id: string
  initiativeId: string
  kind: InitiativeOutputKindData
  label: string
  value: string
  sourceSessionId: string | null
  status: InitiativeOutputStatusData
  createdAt: string
  updatedAt: string
}

interface CreateInitiativeInputData {
  title: string
  status?: InitiativeStatusData
  attention?: InitiativeAttentionData
  currentUnderstanding?: string
}

interface UpdateInitiativeInputData {
  title?: string
  status?: InitiativeStatusData
  attention?: InitiativeAttentionData
  currentUnderstanding?: string
}

interface LinkInitiativeAttemptInputData {
  initiativeId: string
  sessionId: string
  role?: InitiativeAttemptRoleData
  isPrimary?: boolean
}

interface UpdateInitiativeAttemptInputData {
  role?: InitiativeAttemptRoleData
}

interface CreateInitiativeOutputInputData {
  initiativeId: string
  kind: InitiativeOutputKindData
  label: string
  value: string
  sourceSessionId?: string | null
  status?: InitiativeOutputStatusData
}

interface UpdateInitiativeOutputInputData {
  kind?: InitiativeOutputKindData
  label?: string
  value?: string
  sourceSessionId?: string | null
  status?: InitiativeOutputStatusData
}

interface WorkspaceData {
  id: string
  projectId: string
  branchName: string
  path: string
  type: 'worktree'
  createdAt: string
}

interface CreateWorkspaceInput {
  projectId: string
  branchName: string
  baseBranch?: string | null
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
type ActivitySignal =
  | null
  | 'streaming'
  | 'thinking'
  | 'compacting'
  | 'waiting-approval'
  | `tool:${string}`
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
  defaultEffort: ReasoningEffort | null
  effortOptions: ProviderEffortOption[]
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
}

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

interface SessionSummaryData {
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
  forkStrategy: 'full' | 'summary' | null
  primarySurface: 'conversation' | 'terminal'
  continuationToken: string | null
  lastSequence: number
  createdAt: string
  updatedAt: string
}

interface CreateSessionInput {
  projectId: string
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  name: string
  primarySurface?: 'conversation' | 'terminal'
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
}

interface ProviderStatusInfo {
  id: string
  name: string
  vendorLabel: string
  availability: 'available' | 'unavailable'
  statusLabel: string
  binaryPath: string | null
  version: string | null
  reason: string | null
}

type FeedbackKindData = 'bug' | 'idea' | 'ui' | 'other'

interface FeedbackContextData {
  activeProjectId?: string | null
  activeProjectName?: string | null
  activeSessionId?: string | null
  appUrl?: string | null
}

interface SubmitFeedbackInputData {
  kind: FeedbackKindData
  message: string
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

interface ElectronAPI {
  system: {
    getInfo: () => SystemInfo
  }
  project: {
    create: (input: CreateProjectInput) => Promise<ProjectData>
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
  initiative: {
    list: () => Promise<InitiativeData[]>
    getById: (id: string) => Promise<InitiativeData | null>
    create: (input: CreateInitiativeInputData) => Promise<InitiativeData>
    update: (
      id: string,
      input: UpdateInitiativeInputData,
    ) => Promise<InitiativeData>
    delete: (id: string) => Promise<void>
    listAttempts: (initiativeId: string) => Promise<InitiativeAttemptData[]>
    listAttemptsForSession: (
      sessionId: string,
    ) => Promise<InitiativeAttemptData[]>
    linkAttempt: (
      input: LinkInitiativeAttemptInputData,
    ) => Promise<InitiativeAttemptData>
    updateAttempt: (
      id: string,
      input: UpdateInitiativeAttemptInputData,
    ) => Promise<InitiativeAttemptData>
    unlinkAttempt: (id: string) => Promise<void>
    setPrimaryAttempt: (
      initiativeId: string,
      attemptId: string,
    ) => Promise<InitiativeAttemptData>
    listOutputs: (initiativeId: string) => Promise<InitiativeOutputData[]>
    addOutput: (
      input: CreateInitiativeOutputInputData,
    ) => Promise<InitiativeOutputData>
    updateOutput: (
      id: string,
      input: UpdateInitiativeOutputInputData,
    ) => Promise<InitiativeOutputData>
    deleteOutput: (id: string) => Promise<void>
  }
  dialog: {
    selectDirectory: () => Promise<string | null>
  }
  workspace: {
    create: (input: CreateWorkspaceInput) => Promise<WorkspaceData>
    getByProjectId: (projectId: string) => Promise<WorkspaceData[]>
    getAll: () => Promise<WorkspaceData[]>
    delete: (id: string) => Promise<void>
  }
  git: {
    getBranches: (repoPath: string) => Promise<string[]>
    getAllBranches: (repoPath: string) => Promise<string[]>
    getCurrentBranch: (repoPath: string) => Promise<string>
    getStatus: (
      repoPath: string,
    ) => Promise<Array<{ status: string; file: string }>>
    getDiff: (repoPath: string, filePath?: string) => Promise<string>
  }
  session: {
    create: (input: CreateSessionInput) => Promise<SessionSummaryData>
    getSummariesByProjectId: (
      projectId: string,
    ) => Promise<SessionSummaryData[]>
    getAllSummaries: () => Promise<SessionSummaryData[]>
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
    approve: (id: string) => Promise<void>
    deny: (id: string) => Promise<void>
    stop: (id: string) => Promise<void>
    rename: (id: string, name: string) => Promise<void>
    regenerateName: (id: string) => Promise<void>
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
    forkPreviewSummary: (
      parentId: string,
      requestId?: string,
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
    getStatuses: () => Promise<ProviderStatusInfo[]>
  }
  mcp: {
    listByProjectId: (projectId: string) => Promise<ProjectMcpVisibility>
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
    ingestFromPaths: (
      sessionId: string,
      paths: string[],
    ) => Promise<AttachmentIngestResult>
    getForSession: (sessionId: string) => Promise<AttachmentData[]>
    getById: (id: string) => Promise<AttachmentData | null>
    readBytes: (id: string) => Promise<Uint8Array>
    delete: (id: string) => Promise<void>
    showOpenDialog: () => Promise<string[] | null>
  }
  appSettings: {
    get: () => Promise<AppSettingsData>
    set: (input: AppSettingsData) => Promise<AppSettingsData>
    onUpdated: (callback: (settings: AppSettingsData) => void) => () => void
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

interface NotificationEventPrefsData {
  finished: boolean
  needsInput: boolean
  needsApproval: boolean
  errored: boolean
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

interface AppSettingsData {
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId: ReasoningEffort | null
  namingModelByProvider: Record<string, string>
  extractionModelByProvider: Record<string, string>
  notifications: NotificationPrefsData
  onboarding: OnboardingPrefsData
  updates: UpdatePrefsData
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
