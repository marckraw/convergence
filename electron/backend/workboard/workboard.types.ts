export type WorkboardTrackerType = 'linear' | 'jira'

export type WorkboardTrackerStatus = 'connected' | 'needs-auth' | 'syncing'

export interface WorkboardTrackerSource {
  id: string
  type: WorkboardTrackerType
  name: string
  status: WorkboardTrackerStatus
  scope: string
  syncedAt: string
  candidateCount: number
}

export type WorkboardIssueState =
  | 'candidate'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'review'
  | 'done'
  | 'failed'

export type WorkboardIssuePriority = 'urgent' | 'high' | 'medium' | 'low'

export type WorkboardMappingStatus =
  | 'mapped'
  | 'needs-mapping'
  | 'project-not-ready'

export interface WorkboardIssueCandidate {
  id: string
  trackerType: WorkboardTrackerType
  trackerName: string
  externalKey: string
  title: string
  projectName: string | null
  mappingStatus: WorkboardMappingStatus
  mappingRule: string
  state: WorkboardIssueState
  priority: WorkboardIssuePriority
  labels: string[]
  estimate: string
  summary: string
  updatedAt: string
}

export type WorkboardSandcastleStatus =
  | 'ready'
  | 'missing-sandcastle'
  | 'auth-risk'
  | 'needs-docker'

export interface WorkboardSandcastleCheck {
  id: string
  label: string
  state: 'pass' | 'warn' | 'fail'
}

export interface WorkboardProjectGroup {
  id: string
  projectId: string
  projectName: string
  repoPath: string
  trackerScopes: string[]
  workflow: 'sequential reviewer' | 'simple loop' | 'parallel planner'
  policy: 'safe smoke' | 'review-heavy' | 'parallel review'
  sandcastleStatus: WorkboardSandcastleStatus
  checks: WorkboardSandcastleCheck[]
  candidateIds: string[]
  selectedIssueIds: string[]
}

export type WorkboardRunStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'blocked'
  | 'review'
  | 'done'
  | 'failed'
  | 'stopping'
  | 'stopped'

export type WorkboardStageRole =
  | 'sync'
  | 'planner'
  | 'implementer'
  | 'reviewer'
  | 'writeback'
  | 'merger'

export type WorkboardStageStatus =
  | 'waiting'
  | 'running'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'stopping'
  | 'stopped'

export interface WorkboardStageRun {
  id: string
  role: WorkboardStageRole
  status: WorkboardStageStatus
  provider: 'Claude Code' | 'Codex' | 'Convergence'
  model: string
  iteration: number
  maxIterations: number
  logPreview: string
  elapsed: string
}

export interface WorkboardRunEvent {
  id: string
  stageId: string | null
  sequence: number
  type: string
  message: string
  createdAt: string
}

export interface WorkboardActiveRun {
  id: string
  projectName: string
  repoPath: string
  workflow: WorkboardProjectGroup['workflow']
  policy: WorkboardProjectGroup['policy']
  status: WorkboardRunStatus
  branchStrategy: 'explicit branch' | 'merge-to-head'
  branchName: string
  sandbox: 'Docker' | 'No sandbox'
  progressPercent: number
  issueIds: string[]
  currentStage: WorkboardStageRole
  startedAt: string
  logFilePath: string
  commits: string[]
  summary: string
  stages: WorkboardStageRun[]
  recentEvents: WorkboardRunEvent[]
}

export interface WorkboardRunRecord {
  id: string
  projectId: string
  projectName: string
  status: WorkboardRunStatus
  workflowPolicy: string
  sandboxMode: string
  branchStrategy: string
  branchName: string
  repoPath: string
  logRoot: string
  currentStageId: string | null
  progress: Record<string, unknown>
  error: string | null
  sandcastleResult: Record<string, unknown>
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkboardRunIssueRecord {
  runId: string
  trackerIssueId: string
  sortOrder: number
  laneStatus: string
  branchName: string | null
  summary: string
  createdAt: string
  updatedAt: string
}

export interface WorkboardStageRecord {
  id: string
  runId: string
  role: WorkboardStageRole
  status: WorkboardStageStatus
  providerId: string
  model: string | null
  effort: string | null
  maxIterations: number
  iterationCount: number
  logFilePath: string
  commitShas: string[]
  startedAt: string | null
  endedAt: string | null
  error: string | null
  result: Record<string, unknown>
}

export interface WorkboardEventRecord {
  id: string
  runId: string
  stageId: string | null
  sequence: number
  type: string
  message: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface CreateWorkboardRunInput {
  id?: string
  projectId: string
  status: WorkboardRunStatus
  workflowPolicy: string
  sandboxMode: string
  branchStrategy: string
  branchName: string
  repoPath: string
  logRoot: string
  progress?: Record<string, unknown>
  startedAt?: string | null
}

export interface CreateWorkboardStageInput {
  id?: string
  runId: string
  role: WorkboardStageRole
  status: WorkboardStageStatus
  providerId: string
  model?: string | null
  effort?: string | null
  maxIterations?: number
  logFilePath?: string
  startedAt?: string | null
}

export interface AppendWorkboardEventInput {
  runId: string
  stageId?: string | null
  type: string
  message: string
  payload?: Record<string, unknown>
}

export interface StartWorkboardRunInput {
  projectId: string
  issueIds: string[]
  providerId?: 'claude-code' | 'codex'
  model?: string
  effort?: string
  maxIterations?: number
  sandboxMode?: string
}

export interface WorkboardStartRunResult {
  runId: string
  snapshot: WorkboardSnapshot
}

export interface WorkboardSnapshot {
  trackerSources: WorkboardTrackerSource[]
  candidates: WorkboardIssueCandidate[]
  projectGroups: WorkboardProjectGroup[]
  activeRuns: WorkboardActiveRun[]
  selectedRunId: string
}

export interface WorkboardTrackerSourceRecord {
  id: string
  type: WorkboardTrackerType
  name: string
  enabled: boolean
  auth: Record<string, unknown>
  sync: Record<string, unknown>
  lastSyncAt: string | null
  lastSyncError: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertWorkboardTrackerSourceInput {
  id?: string
  type: WorkboardTrackerType
  name: string
  enabled?: boolean
  auth?: Record<string, unknown>
  sync?: Record<string, unknown>
}

export interface WorkboardTrackerIssueRecord {
  id: string
  sourceId: string
  externalId: string
  externalKey: string
  url: string
  title: string
  body: string
  labels: string[]
  status: string
  priority: string | null
  assignee: string | null
  updatedAtExternal: string | null
  raw: Record<string, unknown>
  lastSeenAt: string
  createdAt: string
  updatedAt: string
}

export interface UpsertWorkboardTrackerIssueInput {
  sourceId: string
  externalId: string
  externalKey: string
  url: string
  title: string
  body?: string
  labels?: string[]
  status?: string
  priority?: string | null
  assignee?: string | null
  updatedAtExternal?: string | null
  raw?: Record<string, unknown>
}

export interface WorkboardProjectMappingRecord {
  id: string
  sourceId: string
  name: string
  enabled: boolean
  priority: number
  matcher: Record<string, unknown>
  projectId: string
  workflowPolicy: string
  sandboxMode: string
  branchPrefix: string
  stageDefaults: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WorkboardProjectMappingWithProjectRecord extends WorkboardProjectMappingRecord {
  projectName: string
  repositoryPath: string
}

export interface UpsertWorkboardProjectMappingInput {
  id?: string
  sourceId: string
  name: string
  enabled?: boolean
  priority?: number
  matcher?: Record<string, unknown>
  projectId: string
  workflowPolicy?: string
  sandboxMode?: string
  branchPrefix?: string
  stageDefaults?: Record<string, unknown>
}
