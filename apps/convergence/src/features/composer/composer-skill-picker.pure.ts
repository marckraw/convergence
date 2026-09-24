import type { SkillSelection } from '@/entities/skill'
export { filterComposerSkills } from '@/entities/skill'

export function filterSelectionsForProvider(
  selections: SkillSelection[],
  providerId: string | null,
): SkillSelection[] {
  if (!providerId) {
    return []
  }

  return selections.filter((selection) => selection.providerId === providerId)
}
