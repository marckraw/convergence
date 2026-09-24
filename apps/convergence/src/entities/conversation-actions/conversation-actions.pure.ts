import {
  loomCrewForConversation,
  type LoomNavigationRequest,
} from '@/entities/loom-navigation'
import { seatTicket, LOOM_NO_ACTIVE_TICKET } from '@/entities/work-ledger'
import {
  filterComposerSkills,
  skillSelectionFromCatalogEntry,
  type ProjectSkillCatalog,
} from '@/entities/skill'
import type {
  ConversationAction,
  ConversationProjectAction,
  ConversationProjectContext,
  ConversationRoutineAction,
} from './conversation-actions.types'

export function buildConversationActions({
  routines,
  skillCatalog,
  providerId,
  project,
}: {
  routines: ConversationRoutineAction[]
  skillCatalog: ProjectSkillCatalog | null
  providerId: string
  project?: ConversationProjectContext
}): ConversationAction[] {
  return [
    ...filterComposerSkills({
      catalog: skillCatalog,
      providerId,
      query: '',
    }).map(
      (entry): ConversationAction => ({
        id: `skill:${entry.id}`,
        kind: 'skill',
        label: entry.displayName,
        offered: entry.enabled,
        ...(!entry.enabled
          ? {
              reason:
                entry.warnings.find((warning) => warning.code === 'disabled')
                  ?.message ?? 'This skill is disabled.',
            }
          : {}),
        skill: skillSelectionFromCatalogEntry(entry),
      }),
    ),
    ...routines,
    ...(project ? buildConversationProjectActions(project) : []),
  ]
}

export function buildConversationProjectActions(
  context: ConversationProjectContext,
): ConversationProjectAction[] {
  const { sessionId, crews, snapshots, currentCrewId } = context
  const crewId = loomCrewForConversation({
    session: { id: sessionId, projectId: null },
    crews: crews.map((crew) => ({
      ...crew,
      bound: Boolean(crew.trackerBinding),
    })),
    sessions: [],
    current: currentCrewId,
  })
  const crew = crews.find((candidate) => candidate.id === crewId)
  const member = crew?.members.find(
    (candidate) => candidate.sessionId === sessionId,
  )
  if (!crew?.trackerBinding || !member) return []
  const actions: ConversationProjectAction[] = []
  if (member.role === 'horse') {
    const entry = seatTicket(snapshots[crew.id]?.entries ?? [], crew.id, member)
    actions.push({
      id: 'project:open-issue',
      kind: 'project',
      label: 'Open its issue',
      offered: entry !== null,
      ...(entry
        ? {
            navigation: {
              crewId: crew.id,
              target: { kind: 'issue', entry, sessionId },
            } satisfies LoomNavigationRequest,
          }
        : { reason: LOOM_NO_ACTIVE_TICKET }),
    })
  }
  actions.push({
    id: 'project:show-in-loom',
    kind: 'project',
    label: 'Show in Loom',
    offered: true,
    navigation: { crewId: crew.id, target: { kind: 'seat', sessionId } },
  })
  return actions
}
