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

type TranscriptEntry =
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

interface SessionData {
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
  archivedAt?: string | null
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
}

interface ProviderInfo {
  id: string
  name: string
  vendorLabel: string
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
    getCurrentBranch: (repoPath: string) => Promise<string>
    getStatus: (
      repoPath: string,
    ) => Promise<Array<{ status: string; file: string }>>
    getDiff: (repoPath: string, filePath?: string) => Promise<string>
  }
  session: {
    create: (input: CreateSessionInput) => Promise<SessionData>
    getByProjectId: (projectId: string) => Promise<SessionData[]>
    getAll: () => Promise<SessionData[]>
    getById: (id: string) => Promise<SessionData | null>
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
    getNeedsYouDismissals: () => Promise<NeedsYouDismissals>
    setNeedsYouDismissals: (dismissals: NeedsYouDismissals) => Promise<void>
    getRecentIds: () => Promise<string[]>
    setRecentIds: (ids: string[]) => Promise<void>
    onSessionUpdate: (callback: (session: SessionData) => void) => () => void
    forkPreviewSummary: (
      parentId: string,
      requestId?: string,
    ) => Promise<unknown>
    forkFull: (input: unknown) => Promise<SessionData>
    forkSummary: (input: unknown) => Promise<SessionData>
  }
  provider: {
    getAll: () => Promise<ProviderInfo[]>
    getStatuses: () => Promise<ProviderStatusInfo[]>
  }
  mcp: {
    listByProjectId: (projectId: string) => Promise<ProjectMcpVisibility>
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
}

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

interface AppSettingsData {
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId: ReasoningEffort | null
  namingModelByProvider: Record<string, string>
  extractionModelByProvider: Record<string, string>
  notifications: NotificationPrefsData
  onboarding: OnboardingPrefsData
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
