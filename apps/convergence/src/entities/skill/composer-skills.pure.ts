import type { ProjectSkillCatalog, SkillCatalogEntry } from './skill.types'

export interface FilterComposerSkillsInput {
  catalog: ProjectSkillCatalog | null
  providerId: string | null
  query: string
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function matchesQuery(skill: SkillCatalogEntry, query: string): boolean {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) {
    return true
  }

  return [
    skill.name,
    skill.displayName,
    skill.description,
    skill.shortDescription,
    skill.providerName,
    skill.sourceLabel,
    skill.path,
  ]
    .map(normalize)
    .join(' ')
    .includes(normalizedQuery)
}

export function filterComposerSkills({
  catalog,
  providerId,
  query,
}: FilterComposerSkillsInput): SkillCatalogEntry[] {
  if (!catalog) {
    return []
  }

  return catalog.providers
    .filter((provider) => !providerId || provider.providerId === providerId)
    .flatMap((provider) => provider.skills)
    .filter((skill) => matchesQuery(skill, query))
    .sort((left, right) => {
      if (left.enabled !== right.enabled) {
        return left.enabled ? -1 : 1
      }
      return left.displayName.localeCompare(right.displayName)
    })
}
