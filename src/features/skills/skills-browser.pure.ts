import type {
  ProjectSkillCatalog,
  ProviderSkillCatalog,
  SkillCatalogEntry,
  SkillDependencyState,
  SkillProviderId,
  SkillScope,
} from '@/entities/skill'

export type SkillEnabledFilter = 'all' | 'enabled' | 'disabled'
export type SkillWarningFilter = 'all' | 'warnings'
export type SkillDependencyStateFilter = 'all' | SkillDependencyState

export interface SkillBrowserFilters {
  query: string
  providerId: SkillProviderId | 'all'
  scope: SkillScope | 'all'
  enabled: SkillEnabledFilter
  warnings: SkillWarningFilter
  dependencyState: SkillDependencyStateFilter
}

export interface SkillBrowserProviderGroup extends Omit<
  ProviderSkillCatalog,
  'skills'
> {
  skills: SkillCatalogEntry[]
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function matchesQuery(
  skill: SkillCatalogEntry,
  provider: ProviderSkillCatalog,
  query: string,
): boolean {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) {
    return true
  }

  const haystack = [
    skill.name,
    skill.displayName,
    skill.description,
    skill.shortDescription,
    skill.sourceLabel,
    skill.scope,
    skill.rawScope,
    skill.path,
    provider.providerName,
    provider.providerId,
    ...skill.dependencies.flatMap((dependency) => [
      dependency.kind,
      dependency.name,
      dependency.state,
    ]),
    ...skill.warnings.map((warning) => warning.message),
  ]
    .map(normalize)
    .join(' ')

  return haystack.includes(normalizedQuery)
}

function matchesFilters(
  skill: SkillCatalogEntry,
  provider: ProviderSkillCatalog,
  filters: SkillBrowserFilters,
): boolean {
  if (
    filters.providerId !== 'all' &&
    provider.providerId !== filters.providerId
  ) {
    return false
  }
  if (filters.scope !== 'all' && skill.scope !== filters.scope) {
    return false
  }
  if (filters.enabled === 'enabled' && !skill.enabled) {
    return false
  }
  if (filters.enabled === 'disabled' && skill.enabled) {
    return false
  }
  if (filters.warnings === 'warnings' && skill.warnings.length === 0) {
    return false
  }
  if (
    filters.dependencyState !== 'all' &&
    !skill.dependencies.some(
      (dependency) => dependency.state === filters.dependencyState,
    )
  ) {
    return false
  }

  return matchesQuery(skill, provider, filters.query)
}

export function filterSkillCatalog(
  catalog: ProjectSkillCatalog | null,
  filters: SkillBrowserFilters,
): SkillBrowserProviderGroup[] {
  if (!catalog) {
    return []
  }

  return catalog.providers
    .filter(
      (provider) =>
        filters.providerId === 'all' ||
        provider.providerId === filters.providerId,
    )
    .map((provider) => ({
      ...provider,
      skills: provider.skills.filter((skill) =>
        matchesFilters(skill, provider, filters),
      ),
    }))
    .filter((provider) => provider.skills.length > 0 || provider.error)
}

export function findSkillInGroups(
  groups: SkillBrowserProviderGroup[],
  skillId: string | null,
): SkillCatalogEntry | null {
  if (!skillId) {
    return null
  }

  for (const group of groups) {
    const skill = group.skills.find((entry) => entry.id === skillId)
    if (skill) {
      return skill
    }
  }

  return null
}

export function firstSkillInGroups(
  groups: SkillBrowserProviderGroup[],
): SkillCatalogEntry | null {
  for (const group of groups) {
    if (group.skills.length > 0) {
      return group.skills[0]
    }
  }

  return null
}

export function hasMcpDependencies(skill: SkillCatalogEntry): boolean {
  return skill.dependencies.some((dependency) => dependency.kind === 'mcp')
}

export function getNativeSkillInvocationText(
  skill: SkillCatalogEntry,
): string | null {
  if (!skill.name.trim()) {
    return null
  }

  switch (skill.providerId) {
    case 'codex':
      return `$${skill.name}`
    case 'claude-code':
      return `/${skill.name}`
    case 'pi':
      return `/skill:${skill.name}`
    default:
      return null
  }
}
