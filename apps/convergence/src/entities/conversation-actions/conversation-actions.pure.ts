import {
  filterComposerSkills,
  skillSelectionFromCatalogEntry,
  type ProjectSkillCatalog,
} from '@/entities/skill'
import type {
  ConversationAction,
  ConversationRoutineAction,
} from './conversation-actions.types'

export function buildConversationActions({
  routines,
  skillCatalog,
  providerId,
}: {
  routines: ConversationRoutineAction[]
  skillCatalog: ProjectSkillCatalog | null
  providerId: string
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
  ]
}
