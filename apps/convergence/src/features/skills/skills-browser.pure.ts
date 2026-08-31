import type {
  ProjectSkillCatalog,
  ProviderSkillCatalog,
  SkillCatalogEntry,
  SkillDependencyState,
  SkillProviderId,
  SkillScope,
  SkillWarningCode,
} from '@/entities/skill'
import {
  SCOPE_LABELS,
  type SkillOrigin,
  scopeOrigin,
} from './skills-browser.styles'

export type SkillEnabledFilter = 'all' | 'enabled' | 'disabled'
/** 'all' = no filter, 'warnings' = any warning, or a specific warning code. */
export type SkillWarningFilter = 'all' | 'warnings' | SkillWarningCode
export type SkillDependencyStateFilter = 'all' | SkillDependencyState
export type SkillOriginFilter = 'all' | SkillOrigin

export interface SkillBrowserFilters {
  query: string
  providerId: SkillProviderId | 'all'
  origin: SkillOriginFilter
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
  if (filters.origin !== 'all' && scopeOrigin(skill.scope) !== filters.origin) {
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
  if (filters.warnings === 'warnings') {
    if (skill.warnings.length === 0) {
      return false
    }
  } else if (filters.warnings !== 'all') {
    if (!skill.warnings.some((warning) => warning.code === filters.warnings)) {
      return false
    }
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

export function flattenGroups(
  groups: SkillBrowserProviderGroup[],
): SkillCatalogEntry[] {
  return groups.flatMap((group) => group.skills)
}

export type SkillReadiness = 'ready' | 'needs-install' | 'needs-auth'

/**
 * Collapses a skill's dependency states into a single readiness signal.
 * Auth gating wins over install gating because it blocks usage outright.
 */
export function skillReadiness(skill: SkillCatalogEntry): SkillReadiness {
  if (
    skill.dependencies.some((dependency) => dependency.state === 'needs-auth')
  ) {
    return 'needs-auth'
  }
  if (
    skill.dependencies.some(
      (dependency) => dependency.state === 'needs-install',
    )
  ) {
    return 'needs-install'
  }
  return 'ready'
}

const READINESS_LABELS: Record<SkillReadiness, string> = {
  ready: 'Ready',
  'needs-install': 'Needs install',
  'needs-auth': 'Needs auth',
}

const READINESS_ORDER: SkillReadiness[] = [
  'needs-auth',
  'needs-install',
  'ready',
]

export type SkillGroupBy = 'provider' | 'scope' | 'readiness' | 'none'

export interface SkillGridGroup {
  key: string
  label: string
  skills: SkillCatalogEntry[]
}

/**
 * Reshapes the already-filtered provider groups for the grid view. The grid
 * can stay grouped by provider (the catalog's natural shape) or regroup the
 * flattened skills by scope, dependency readiness, or not at all.
 */
export function groupSkillsForGrid(
  groups: SkillBrowserProviderGroup[],
  groupBy: SkillGroupBy,
): SkillGridGroup[] {
  if (groupBy === 'provider') {
    return groups
      .filter((group) => group.skills.length > 0)
      .map((group) => ({
        key: group.providerId,
        label: group.providerName,
        skills: group.skills,
      }))
  }

  const skills = flattenGroups(groups)
  if (skills.length === 0) {
    return []
  }

  if (groupBy === 'none') {
    return [{ key: 'all', label: 'All skills', skills }]
  }

  if (groupBy === 'scope') {
    const buckets = new Map<SkillScope, SkillCatalogEntry[]>()
    for (const skill of skills) {
      const bucket = buckets.get(skill.scope) ?? []
      bucket.push(skill)
      buckets.set(skill.scope, bucket)
    }
    return Array.from(buckets, ([scope, bucketSkills]) => ({
      key: scope,
      label: SCOPE_LABELS[scope],
      skills: bucketSkills,
    })).sort((a, b) => b.skills.length - a.skills.length)
  }

  const buckets = new Map<SkillReadiness, SkillCatalogEntry[]>()
  for (const skill of skills) {
    const readiness = skillReadiness(skill)
    const bucket = buckets.get(readiness) ?? []
    bucket.push(skill)
    buckets.set(readiness, bucket)
  }
  return READINESS_ORDER.filter((readiness) => buckets.has(readiness)).map(
    (readiness) => ({
      key: readiness,
      label: READINESS_LABELS[readiness],
      skills: buckets.get(readiness) ?? [],
    }),
  )
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
    case 'antigravity':
      return `/${skill.name}`
    case 'pi':
      return `/skill:${skill.name}`
    case 'cursor':
      return `/${skill.name}`
    default:
      return null
  }
}
