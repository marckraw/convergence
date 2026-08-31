import type {
  SkillCatalogEntry,
  SkillInvocationStatus,
  SkillSelection,
} from './skills.types'

export function selectionFromCatalogEntry(
  entry: SkillCatalogEntry,
  status: SkillInvocationStatus,
  argumentText?: string,
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
    ...(argumentText ? { argumentText } : {}),
  }
}

export function markSkillSelectionsStatus(
  selections: SkillSelection[] | undefined,
  status: SkillInvocationStatus,
): SkillSelection[] | undefined {
  if (!selections || selections.length === 0) {
    return undefined
  }

  return selections.map((selection) => ({
    ...selection,
    status,
  }))
}

export function uniqueSkillSelections(
  selections: SkillSelection[],
): SkillSelection[] {
  const seen = new Set<string>()
  return selections.filter((selection) => {
    if (seen.has(selection.id)) {
      return false
    }
    seen.add(selection.id)
    return true
  })
}
