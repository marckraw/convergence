export type AnalyticsRangePreset = '7d' | '30d' | '90d' | 'all'

export interface AnalyticsRange {
  preset: AnalyticsRangePreset
  startDate: string | null
  endDate: string
}

export interface AnalyticsSessionInput {
  id: string
  projectId: string
  projectName: string
  providerId: string
  providerName: string
  status: string
  primarySurface: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AnalyticsConversationItemKind =
  | 'message'
  | 'thinking'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'input-request'
  | 'note'

export interface AnalyticsConversationItemInput {
  id: string
  sessionId: string
  kind: AnalyticsConversationItemKind
  actor: 'user' | 'assistant' | null
  text: string
  createdAt: string
}

export interface AnalyticsTurnInput {
  id: string
  sessionId: string
  status: string
  startedAt: string
  endedAt: string | null
}

export interface AnalyticsFileChangeInput {
  id: string
  sessionId: string
  turnId: string
  additions: number
  deletions: number
  createdAt: string
}

export interface AnalyticsAttachmentInput {
  id: string
  sessionId: string
  createdAt: string
}

export interface BuildAnalyticsOverviewInput {
  now: string
  rangePreset: AnalyticsRangePreset
  sessions: AnalyticsSessionInput[]
  conversationItems: AnalyticsConversationItemInput[]
  turns: AnalyticsTurnInput[]
  fileChanges: AnalyticsFileChangeInput[]
  attachments: AnalyticsAttachmentInput[]
  generatedProfile: GeneratedWorkProfileSnapshot | null
}

export interface AnalyticsTotals {
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

export interface AnalyticsStreaks {
  current: number
  longest: number
  activeDays: string[]
}

export interface DailyActivityPoint {
  date: string
  userMessages: number
  assistantMessages: number
  userWords: number
  assistantWords: number
  sessionsCreated: number
  turnsCompleted: number
  filesChanged: number
}

export interface ProviderUsagePoint {
  providerId: string
  providerName: string
  sessionsCreated: number
  turnsCompleted: number
  userMessages: number
  assistantMessages: number
}

export interface ProjectUsagePoint {
  projectId: string
  projectName: string
  sessionsCreated: number
  turnsCompleted: number
  userMessages: number
  assistantMessages: number
}

export interface WeekdayHourActivityPoint {
  weekday: number
  hour: number
  count: number
}

export interface ConversationBalancePoint {
  date: string
  userWords: number
  assistantWords: number
}

export type WorkStyleInteractionShape =
  | 'none'
  | 'mostly-ask-review'
  | 'mostly-implementation'
  | 'mostly-debugging'
  | 'mixed-exploration-implementation'

export type WorkStyleSessionSizeBucket =
  | 'none'
  | 'quick-check'
  | 'normal-task'
  | 'long-running'

export interface DeterministicWorkProfile {
  mostUsedProvider: ProviderUsagePoint | null
  mostActiveProject: ProjectUsagePoint | null
  peakActivity: WeekdayHourActivityPoint | null
  sessionSizeBucket: WorkStyleSessionSizeBucket
  interactionShape: WorkStyleInteractionShape
  summary: string
}

export interface GeneratedWorkProfileSnapshotPayload {
  version: 1
  title: string
  summary: string
  themes: Array<{ label: string; description: string }>
  caveats: string[]
}

export interface GeneratedWorkProfileSnapshot {
  id: string
  rangePreset: AnalyticsRangePreset
  rangeStartDate: string | null
  rangeEndDate: string
  providerId: string | null
  model: string | null
  payload: GeneratedWorkProfileSnapshotPayload
  createdAt: string
}

export interface CreateGeneratedWorkProfileSnapshotInput {
  rangePreset: AnalyticsRangePreset
  rangeStartDate: string | null
  rangeEndDate: string
  providerId: string | null
  model: string | null
  payload: GeneratedWorkProfileSnapshotPayload
  createdAt?: string
}

export interface AnalyticsOverview {
  range: AnalyticsRange
  totals: AnalyticsTotals
  streaks: AnalyticsStreaks
  dailyActivity: DailyActivityPoint[]
  providerUsage: ProviderUsagePoint[]
  projectUsage: ProjectUsagePoint[]
  weekdayHourActivity: WeekdayHourActivityPoint[]
  conversationBalance: ConversationBalancePoint[]
  deterministicProfile: DeterministicWorkProfile
  generatedProfile: GeneratedWorkProfileSnapshot | null
}
