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

/**
 * Adds one chip, never toggles one off (MAR-3393 R2).
 *
 * The add-without-toggle rule `handleSkillInjectionSelect` has always used,
 * named so the Actions menu's intent goes through the very same path: a skill
 * already selected stays selected, and nothing else in the list moves.
 */
export function addSkillSelectionOnce(
  selections: SkillSelection[],
  skill: SkillSelection,
): SkillSelection[] {
  if (selections.some((selection) => selection.id === skill.id)) {
    return selections
  }
  return [...selections, skill]
}
