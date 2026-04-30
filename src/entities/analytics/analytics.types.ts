export type AnalyticsRangePreset = '7d' | '30d' | '90d' | 'all'

export interface AnalyticsRange {
  preset: AnalyticsRangePreset
  startDate: string | null
  endDate: string
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
