import type {
  SkillCatalogEntry,
  SkillInvocationStatus,
  SkillSelection,
} from './skill.types'

export function skillSelectionFromCatalogEntry(
  entry: SkillCatalogEntry,
  status: SkillInvocationStatus = 'selected',
): SkillSelection {
  return {
    id: entry.id,
    providerId: entry.providerId,
    providerName: entry.providerName,
    name: entry.name,
    displayName: entry.displayName,
    path: entry.path,
    scope: entry.scope,
    rawScope: entry.rawScope,
    sourceLabel: entry.sourceLabel,
    status,
  }
}

export function hasSkillSelection(
  selections: SkillSelection[],
  skillId: string,
): boolean {
  return selections.some((selection) => selection.id === skillId)
}
