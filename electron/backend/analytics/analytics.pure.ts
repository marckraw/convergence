import type {
  AnalyticsFileChangeInput,
  AnalyticsOverview,
  AnalyticsRange,
  AnalyticsRangePreset,
  AnalyticsSessionInput,
  AnalyticsStreaks,
  AnalyticsTotals,
  BuildAnalyticsOverviewInput,
  ConversationBalancePoint,
  DailyActivityPoint,
  DeterministicWorkProfile,
  ProjectUsagePoint,
  ProviderUsagePoint,
  WeekdayHourActivityPoint,
  WorkStyleInteractionShape,
  WorkStyleSessionSizeBucket,
} from './analytics.types'

const RANGE_DAYS: Record<Exclude<AnalyticsRangePreset, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

const EMPTY_TOTALS: AnalyticsTotals = {
  userMessages: 0,
  assistantMessages: 0,
  userWords: 0,
  assistantWords: 0,
  sessionsCreated: 0,
  turnsCompleted: 0,
  filesChanged: 0,
  linesAdded: 0,
  linesDeleted: 0,
  approvalRequests: 0,
  inputRequests: 0,
  attachmentsSent: 0,
  toolCalls: 0,
  failedSessions: 0,
}

interface DatedActivity {
  date: string
  timestamp: string
  sessionId: string | null
  projectId: string | null
  projectName: string | null
  providerId: string | null
  providerName: string | null
  kind: 'session' | 'message' | 'turn' | 'file-change' | 'attachment'
  actor: 'user' | 'assistant' | null
  wordCount: number
}

interface SessionLookupValue {
  projectId: string
  projectName: string
  providerId: string
  providerName: string
}

function parseDateParts(date: string): {
  year: number
  month: number
  day: number
} {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  }
}

function toUtcDate(date: string): Date {
  const { year, month, day } = parseDateParts(date)
  return new Date(Date.UTC(year, month - 1, day))
}

function fromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const next = toUtcDate(date)
  next.setUTCDate(next.getUTCDate() + days)
  return fromUtcDate(next)
}

function compareDate(left: string, right: string): number {
  return left.localeCompare(right)
}

function isInRange(date: string, range: AnalyticsRange): boolean {
  if (compareDate(date, range.endDate) > 0) return false
  if (range.startDate && compareDate(date, range.startDate) < 0) return false
  return true
}

function makeDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  for (
    let cursor = startDate;
    compareDate(cursor, endDate) <= 0;
    cursor = addDays(cursor, 1)
  ) {
    dates.push(cursor)
  }
  return dates
}

function parseTimestamp(value: string): Date {
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(value)
    ? value.replace(' ', 'T')
    : value
  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) return parsed
  return new Date(`${value.slice(0, 10)}T00:00:00`)
}

export function toLocalDate(value: string): string {
  const parsed = parseTimestamp(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10)
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export function resolveAnalyticsRange(
  preset: AnalyticsRangePreset,
  now: string,
  activityDates: string[] = [],
): AnalyticsRange {
  const endDate = toLocalDate(now)
  if (preset !== 'all') {
    return {
      preset,
      startDate: addDays(endDate, -(RANGE_DAYS[preset] - 1)),
      endDate,
    }
  }

  const earliest = activityDates
    .filter((date) => compareDate(date, endDate) <= 0)
    .sort(compareDate)[0]

  return {
    preset,
    startDate: earliest ?? null,
    endDate,
  }
}

function getTimestampHour(value: string): number {
  return parseTimestamp(value).getHours()
}

function getWeekday(date: string): number {
  return toUtcDate(date).getUTCDay()
}

function getSessionLookup(
  sessions: AnalyticsSessionInput[],
): Map<string, SessionLookupValue> {
  return new Map(
    sessions.map((session) => [
      session.id,
      {
        projectId: session.projectId,
        projectName: session.projectName,
        providerId: session.providerId,
        providerName: session.providerName,
      },
    ]),
  )
}

function enrichFromSession(
  lookup: Map<string, SessionLookupValue>,
  sessionId: string,
): SessionLookupValue | null {
  return lookup.get(sessionId) ?? null
}

function getActivityDates(input: BuildAnalyticsOverviewInput): string[] {
  return [
    ...input.sessions.map((session) => toLocalDate(session.createdAt)),
    ...input.conversationItems
      .filter((item) => item.kind === 'message')
      .map((item) => toLocalDate(item.createdAt)),
    ...input.turns.map((turn) => toLocalDate(turn.endedAt ?? turn.startedAt)),
  ]
}

function buildDatedActivities(
  input: BuildAnalyticsOverviewInput,
): DatedActivity[] {
  const sessionsById = getSessionLookup(input.sessions)
  const sessionActivities = input.sessions.map<DatedActivity>((session) => ({
    date: toLocalDate(session.createdAt),
    timestamp: session.createdAt,
    sessionId: session.id,
    projectId: session.projectId,
    projectName: session.projectName,
    providerId: session.providerId,
    providerName: session.providerName,
    kind: 'session',
    actor: null,
    wordCount: 0,
  }))

  const messageActivities = input.conversationItems
    .filter((item) => item.kind === 'message')
    .map<DatedActivity>((item) => {
      const session = enrichFromSession(sessionsById, item.sessionId)
      return {
        date: toLocalDate(item.createdAt),
        timestamp: item.createdAt,
        sessionId: item.sessionId,
        projectId: session?.projectId ?? null,
        projectName: session?.projectName ?? null,
        providerId: session?.providerId ?? null,
        providerName: session?.providerName ?? null,
        kind: 'message',
        actor: item.actor,
        wordCount: countWords(item.text),
      }
    })

  const turnActivities = input.turns.map<DatedActivity>((turn) => {
    const session = enrichFromSession(sessionsById, turn.sessionId)
    return {
      date: toLocalDate(turn.endedAt ?? turn.startedAt),
      timestamp: turn.endedAt ?? turn.startedAt,
      sessionId: turn.sessionId,
      projectId: session?.projectId ?? null,
      projectName: session?.projectName ?? null,
      providerId: session?.providerId ?? null,
      providerName: session?.providerName ?? null,
      kind: 'turn',
      actor: null,
      wordCount: 0,
    }
  })

  return [...sessionActivities, ...messageActivities, ...turnActivities]
}

function incrementDaily(
  point: DailyActivityPoint,
  activity: DatedActivity,
): void {
  if (activity.kind === 'session') point.sessionsCreated += 1
  if (activity.kind === 'turn') point.turnsCompleted += 1
  if (activity.kind !== 'message') return
  if (activity.actor === 'user') {
    point.userMessages += 1
    point.userWords += activity.wordCount
  }
  if (activity.actor === 'assistant') {
    point.assistantMessages += 1
    point.assistantWords += activity.wordCount
  }
}

function buildDailyActivity(
  range: AnalyticsRange,
  activities: DatedActivity[],
  fileChanges: AnalyticsFileChangeInput[],
): DailyActivityPoint[] {
  if (!range.startDate) return []
  const points = new Map(
    makeDateRange(range.startDate, range.endDate).map((date) => [
      date,
      {
        date,
        userMessages: 0,
        assistantMessages: 0,
        userWords: 0,
        assistantWords: 0,
        sessionsCreated: 0,
        turnsCompleted: 0,
        filesChanged: 0,
      },
    ]),
  )

  for (const activity of activities) {
    const point = points.get(activity.date)
    if (point) incrementDaily(point, activity)
  }

  for (const change of fileChanges) {
    const point = points.get(toLocalDate(change.createdAt))
    if (point) point.filesChanged += 1
  }

  return [...points.values()]
}

export function calculateStreaks(
  activeDatesInput: string[],
  today: string,
): AnalyticsStreaks {
  const activeDays = [...new Set(activeDatesInput)]
    .filter((date) => compareDate(date, today) <= 0)
    .sort(compareDate)

  let longest = 0
  let currentRun = 0
  let previous: string | null = null
  for (const date of activeDays) {
    currentRun = previous && addDays(previous, 1) === date ? currentRun + 1 : 1
    longest = Math.max(longest, currentRun)
    previous = date
  }

  let current = 0
  let cursor = activeDays.includes(today) ? today : addDays(today, -1)
  const activeSet = new Set(activeDays)
  while (activeSet.has(cursor)) {
    current += 1
    cursor = addDays(cursor, -1)
  }

  return { current, longest, activeDays }
}

function buildTotals(
  range: AnalyticsRange,
  input: BuildAnalyticsOverviewInput,
): AnalyticsTotals {
  const totals = { ...EMPTY_TOTALS }
  const sessionsInRange = input.sessions.filter((session) =>
    isInRange(toLocalDate(session.createdAt), range),
  )
  totals.sessionsCreated = sessionsInRange.length
  totals.failedSessions = sessionsInRange.filter(
    (session) => session.status === 'failed',
  ).length

  for (const item of input.conversationItems) {
    if (!isInRange(toLocalDate(item.createdAt), range)) continue
    if (item.kind === 'message' && item.actor === 'user') {
      totals.userMessages += 1
      totals.userWords += countWords(item.text)
    } else if (item.kind === 'message' && item.actor === 'assistant') {
      totals.assistantMessages += 1
      totals.assistantWords += countWords(item.text)
    } else if (item.kind === 'approval-request') {
      totals.approvalRequests += 1
    } else if (item.kind === 'input-request') {
      totals.inputRequests += 1
    } else if (item.kind === 'tool-call') {
      totals.toolCalls += 1
    }
  }

  totals.turnsCompleted = input.turns.filter(
    (turn) =>
      turn.status === 'completed' &&
      isInRange(toLocalDate(turn.endedAt ?? turn.startedAt), range),
  ).length

  for (const change of input.fileChanges) {
    if (!isInRange(toLocalDate(change.createdAt), range)) continue
    totals.filesChanged += 1
    totals.linesAdded += change.additions
    totals.linesDeleted += change.deletions
  }

  totals.attachmentsSent = input.attachments.filter((attachment) =>
    isInRange(toLocalDate(attachment.createdAt), range),
  ).length

  return totals
}

function makeUsagePointKey(id: string | null): string {
  return id ?? '__unknown__'
}

function buildProviderUsage(
  activities: DatedActivity[],
  range: AnalyticsRange,
): ProviderUsagePoint[] {
  const points = new Map<string, ProviderUsagePoint>()
  for (const activity of activities) {
    if (!isInRange(activity.date, range)) continue
    const key = makeUsagePointKey(activity.providerId)
    const point = points.get(key) ?? {
      providerId: activity.providerId ?? 'unknown',
      providerName: activity.providerName ?? 'Unknown provider',
      sessionsCreated: 0,
      turnsCompleted: 0,
      userMessages: 0,
      assistantMessages: 0,
    }

    if (activity.kind === 'session') point.sessionsCreated += 1
    if (activity.kind === 'turn') point.turnsCompleted += 1
    if (activity.kind === 'message' && activity.actor === 'user') {
      point.userMessages += 1
    }
    if (activity.kind === 'message' && activity.actor === 'assistant') {
      point.assistantMessages += 1
    }
    points.set(key, point)
  }

  return [...points.values()].sort(
    (left, right) =>
      right.sessionsCreated - left.sessionsCreated ||
      right.turnsCompleted - left.turnsCompleted ||
      left.providerName.localeCompare(right.providerName),
  )
}

function buildProjectUsage(
  activities: DatedActivity[],
  range: AnalyticsRange,
): ProjectUsagePoint[] {
  const points = new Map<string, ProjectUsagePoint>()
  for (const activity of activities) {
    if (!isInRange(activity.date, range)) continue
    const key = makeUsagePointKey(activity.projectId)
    const point = points.get(key) ?? {
      projectId: activity.projectId ?? 'unknown',
      projectName: activity.projectName ?? 'Unknown project',
      sessionsCreated: 0,
      turnsCompleted: 0,
      userMessages: 0,
      assistantMessages: 0,
    }

    if (activity.kind === 'session') point.sessionsCreated += 1
    if (activity.kind === 'turn') point.turnsCompleted += 1
    if (activity.kind === 'message' && activity.actor === 'user') {
      point.userMessages += 1
    }
    if (activity.kind === 'message' && activity.actor === 'assistant') {
      point.assistantMessages += 1
    }
    points.set(key, point)
  }

  return [...points.values()].sort(
    (left, right) =>
      right.sessionsCreated - left.sessionsCreated ||
      right.turnsCompleted - left.turnsCompleted ||
      left.projectName.localeCompare(right.projectName),
  )
}

function buildWeekdayHourActivity(
  activities: DatedActivity[],
  range: AnalyticsRange,
): WeekdayHourActivityPoint[] {
  const counts = new Map<string, WeekdayHourActivityPoint>()
  for (const activity of activities) {
    if (!isInRange(activity.date, range)) continue
    const weekday = getWeekday(activity.date)
    const hour = getTimestampHour(activity.timestamp)
    const key = `${weekday}:${hour}`
    const current = counts.get(key) ?? { weekday, hour, count: 0 }
    current.count += 1
    counts.set(key, current)
  }
  return [...counts.values()].sort(
    (left, right) => left.weekday - right.weekday || left.hour - right.hour,
  )
}

function buildConversationBalance(
  dailyActivity: DailyActivityPoint[],
): ConversationBalancePoint[] {
  return dailyActivity.map((point) => ({
    date: point.date,
    userWords: point.userWords,
    assistantWords: point.assistantWords,
  }))
}

function classifySessionSize(
  totals: AnalyticsTotals,
): WorkStyleSessionSizeBucket {
  if (totals.sessionsCreated === 0) return 'none'
  const averageMessages =
    (totals.userMessages + totals.assistantMessages) / totals.sessionsCreated
  if (averageMessages <= 4) return 'quick-check'
  if (averageMessages <= 18) return 'normal-task'
  return 'long-running'
}

function classifyInteractionShape(
  totals: AnalyticsTotals,
): WorkStyleInteractionShape {
  if (totals.sessionsCreated === 0) return 'none'
  if (totals.failedSessions / totals.sessionsCreated >= 0.35) {
    return 'mostly-debugging'
  }
  if (totals.filesChanged >= Math.max(1, totals.sessionsCreated)) {
    return totals.approvalRequests > 0 || totals.inputRequests > 0
      ? 'mixed-exploration-implementation'
      : 'mostly-implementation'
  }
  if (totals.turnsCompleted > totals.sessionsCreated * 2) {
    return 'mixed-exploration-implementation'
  }
  return 'mostly-ask-review'
}

function describeSessionSize(bucket: WorkStyleSessionSizeBucket): string {
  switch (bucket) {
    case 'none':
      return 'no completed local pattern yet'
    case 'quick-check':
      return 'short, quick-check sessions'
    case 'normal-task':
      return 'normal task-sized sessions'
    case 'long-running':
      return 'long-running sessions'
  }
}

function describeInteractionShape(shape: WorkStyleInteractionShape): string {
  switch (shape) {
    case 'none':
      return 'there is not enough activity yet to describe a pattern'
    case 'mostly-ask-review':
      return 'mostly ask-and-review collaboration'
    case 'mostly-implementation':
      return 'mostly implementation-focused work'
    case 'mostly-debugging':
      return 'mostly debugging and recovery work'
    case 'mixed-exploration-implementation':
      return 'mixed exploration and implementation'
  }
}

function buildDeterministicSummary(
  totals: AnalyticsTotals,
  provider: ProviderUsagePoint | null,
  project: ProjectUsagePoint | null,
  sessionSizeBucket: WorkStyleSessionSizeBucket,
  interactionShape: WorkStyleInteractionShape,
): string {
  if (totals.sessionsCreated === 0) {
    return 'There is not enough local activity in this range to describe a work style yet.'
  }

  const providerText = provider ? ` with ${provider.providerName}` : ''
  const projectText = project ? ` in ${project.projectName}` : ''
  return `Based on local activity in this range, you tend toward ${describeInteractionShape(
    interactionShape,
  )}${providerText}${projectText}, usually in ${describeSessionSize(
    sessionSizeBucket,
  )}.`
}

function buildDeterministicProfile(
  totals: AnalyticsTotals,
  providerUsage: ProviderUsagePoint[],
  projectUsage: ProjectUsagePoint[],
  weekdayHourActivity: WeekdayHourActivityPoint[],
): DeterministicWorkProfile {
  const sessionSizeBucket = classifySessionSize(totals)
  const interactionShape = classifyInteractionShape(totals)
  const peakActivity =
    [...weekdayHourActivity].sort(
      (left, right) =>
        right.count - left.count ||
        left.weekday - right.weekday ||
        left.hour - right.hour,
    )[0] ?? null
  const mostUsedProvider = providerUsage[0] ?? null
  const mostActiveProject = projectUsage[0] ?? null

  return {
    mostUsedProvider,
    mostActiveProject,
    peakActivity,
    sessionSizeBucket,
    interactionShape,
    summary: buildDeterministicSummary(
      totals,
      mostUsedProvider,
      mostActiveProject,
      sessionSizeBucket,
      interactionShape,
    ),
  }
}

function getActiveDates(
  range: AnalyticsRange,
  activities: DatedActivity[],
): string[] {
  return activities
    .filter(
      (activity) =>
        isInRange(activity.date, range) &&
        (activity.kind === 'session' ||
          activity.kind === 'message' ||
          activity.kind === 'turn'),
    )
    .map((activity) => activity.date)
}

export function buildAnalyticsOverview(
  input: BuildAnalyticsOverviewInput,
): AnalyticsOverview {
  const activityDates = getActivityDates(input)
  const range = resolveAnalyticsRange(
    input.rangePreset,
    input.now,
    activityDates,
  )
  const activities = buildDatedActivities(input)
  const fileChangesInRange = input.fileChanges.filter((change) =>
    isInRange(toLocalDate(change.createdAt), range),
  )
  const dailyActivity = buildDailyActivity(
    range,
    activities,
    fileChangesInRange,
  )
  const providerUsage = buildProviderUsage(activities, range)
  const projectUsage = buildProjectUsage(activities, range)
  const weekdayHourActivity = buildWeekdayHourActivity(activities, range)
  const totals = buildTotals(range, input)

  return {
    range,
    totals,
    streaks: calculateStreaks(getActiveDates(range, activities), range.endDate),
    dailyActivity,
    providerUsage,
    projectUsage,
    weekdayHourActivity,
    conversationBalance: buildConversationBalance(dailyActivity),
    deterministicProfile: buildDeterministicProfile(
      totals,
      providerUsage,
      projectUsage,
      weekdayHourActivity,
    ),
    generatedProfile: input.generatedProfile,
  }
}
