import type { Project } from '../project/project.types'
import type { NeedsYouDismissals, SessionSummary } from './session.types'

export interface ProjectActivity {
  projectId: string
  projectName: string
  running: SessionSummary[]
  needsAttention: SessionSummary[]
  providerIds: string[]
}

export interface GlobalStatus {
  running: SessionSummary[]
  needsAttention: SessionSummary[]
  byProject: ProjectActivity[]
  lastCompleted: SessionSummary | null
}

function isAttentionSession(
  session: SessionSummary,
  dismissals: NeedsYouDismissals,
): boolean {
  if (
    session.attention !== 'needs-input' &&
    session.attention !== 'needs-approval'
  ) {
    return false
  }
  const dismissal = dismissals[session.id]
  return !dismissal || dismissal.updatedAt !== session.updatedAt
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      result.push(value)
    }
  }
  return result
}

export function selectGlobalStatus(
  sessions: SessionSummary[],
  dismissals: NeedsYouDismissals,
  projects: Project[],
): GlobalStatus {
  const running = sessions.filter((session) => session.status === 'running')
  const needsAttention = sessions.filter((session) =>
    isAttentionSession(session, dismissals),
  )

  const projectNameById = new Map(
    projects.map((project) => [project.id, project.name]),
  )

  const projectIds = uniqueInOrder([
    ...running.map((session) => session.projectId),
    ...needsAttention.map((session) => session.projectId),
  ])

  const byProject: ProjectActivity[] = projectIds.map((projectId) => {
    const projectRunning = running.filter(
      (session) => session.projectId === projectId,
    )
    const projectAttention = needsAttention.filter(
      (session) => session.projectId === projectId,
    )
    const providerIds = uniqueInOrder(
      [...projectAttention, ...projectRunning].map(
        (session) => session.providerId,
      ),
    )
    return {
      projectId,
      projectName: projectNameById.get(projectId) ?? 'Unknown project',
      running: projectRunning,
      needsAttention: projectAttention,
      providerIds,
    }
  })

  byProject.sort((left, right) => {
    const leftAttention = left.needsAttention.length > 0 ? 0 : 1
    const rightAttention = right.needsAttention.length > 0 ? 0 : 1
    if (leftAttention !== rightAttention) {
      return leftAttention - rightAttention
    }

    const leftRecency = mostRecentUpdatedAt(left)
    const rightRecency = mostRecentUpdatedAt(right)
    return rightRecency.localeCompare(leftRecency)
  })

  const lastCompleted = sessions
    .filter(
      (session) =>
        session.status === 'completed' || session.status === 'failed',
    )
    .reduce<SessionSummary | null>((latest, session) => {
      if (!latest) return session
      return session.updatedAt.localeCompare(latest.updatedAt) > 0
        ? session
        : latest
    }, null)

  return {
    running,
    needsAttention,
    byProject,
    lastCompleted,
  }
}

function mostRecentUpdatedAt(activity: ProjectActivity): string {
  const candidates = [...activity.running, ...activity.needsAttention]
  if (candidates.length === 0) return ''
  return candidates.reduce((latest, session) =>
    session.updatedAt.localeCompare(latest.updatedAt) > 0 ? session : latest,
  ).updatedAt
}
