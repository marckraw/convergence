import type { ProviderInfo, SessionSummary } from '@/entities/session'
import { formatSessionCardActivity } from './session-card-activity.pure'
import type { SessionCard } from './mission-control.types'

export interface ProjectNameSource {
  id: string
  name: string
}

export type ProviderLabelSource = Pick<
  ProviderInfo,
  'id' | 'name' | 'vendorLabel'
>

export interface BuildSessionCardsInput {
  sessions: readonly SessionSummary[]
  projects: readonly ProjectNameSource[]
  providers: readonly ProviderLabelSource[]
}

/** Chat Sessions have no Project; the app itself is their context. */
export const GLOBAL_SESSION_PROJECT_NAME = 'Convergence'
const UNKNOWN_PROJECT_NAME = 'Unknown project'

/**
 * Turns live Session Summaries into Session Cards.
 *
 * Two Sessions never become cards: archived ones (Mission Control is the room
 * of current work) and shell ones (a terminal is not an agent working, and
 * terminal support is out of scope for these phases).
 */
export function buildSessionCards({
  sessions,
  projects,
  providers,
}: BuildSessionCardsInput): SessionCard[] {
  const projectNameById = new Map(
    projects.map((project) => [project.id, project.name]),
  )
  const providerLabelById = new Map(
    providers.map((provider) => [
      provider.id,
      provider.vendorLabel || provider.name,
    ]),
  )

  return sessions
    .filter((session) => !session.archivedAt && session.providerId !== 'shell')
    .map((session) => {
      const projectName =
        session.contextKind === 'global'
          ? GLOBAL_SESSION_PROJECT_NAME
          : (projectNameById.get(session.projectId ?? '') ??
            UNKNOWN_PROJECT_NAME)
      const providerLabel =
        providerLabelById.get(session.providerId) ?? session.providerId
      const activityLabel = formatSessionCardActivity({
        activity: session.activity,
        status: session.status,
      })

      return {
        session,
        projectName,
        providerLabel,
        activityLabel,
        searchText: [
          session.name,
          projectName,
          session.providerId,
          providerLabel,
          session.model ?? '',
          session.status,
          activityLabel,
        ]
          .join(' ')
          .toLowerCase(),
      }
    })
}
