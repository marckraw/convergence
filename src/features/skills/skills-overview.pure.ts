import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillProviderId,
} from '@/entities/skill'
import { type SkillOrigin, scopeOrigin } from './skills-browser.styles'

export interface SkillOriginBucket {
  origin: SkillOrigin
  count: number
  enabled: number
  withWarnings: number
}

export interface SkillProviderBucket {
  providerId: SkillProviderId
  providerName: string
  count: number
  errored: boolean
  error: string | null
}

export interface SkillAttentionBuckets {
  duplicates: number
  missingDescription: number
  invalidFrontmatter: number
  unsupportedInvocation: number
  needsInstall: number
  needsAuth: number
  disabled: number
}

export interface SkillsOverview {
  total: number
  enabled: number
  disabled: number
  withWarnings: number
  depsNeedingAction: number
  byOrigin: SkillOriginBucket[]
  byProvider: SkillProviderBucket[]
  attention: SkillAttentionBuckets
}

const EMPTY_OVERVIEW: SkillsOverview = {
  total: 0,
  enabled: 0,
  disabled: 0,
  withWarnings: 0,
  depsNeedingAction: 0,
  byOrigin: [],
  byProvider: [],
  attention: {
    duplicates: 0,
    missingDescription: 0,
    invalidFrontmatter: 0,
    unsupportedInvocation: 0,
    needsInstall: 0,
    needsAuth: 0,
    disabled: 0,
  },
}

function skillHasWarning(skill: SkillCatalogEntry, code: string): boolean {
  return skill.warnings.some((warning) => warning.code === code)
}

function skillHasDependencyState(
  skill: SkillCatalogEntry,
  state: 'needs-install' | 'needs-auth',
): boolean {
  return skill.dependencies.some((dependency) => dependency.state === state)
}

/**
 * Derives the "landscape at a glance" numbers from a catalog. Always reflects
 * the full catalog (not the active filters) so the dashboard answers "what do
 * I actually have on this machine?".
 */
export function buildSkillsOverview(
  catalog: ProjectSkillCatalog | null,
): SkillsOverview {
  if (!catalog) {
    return EMPTY_OVERVIEW
  }

  const originBuckets = new Map<SkillOrigin, SkillOriginBucket>()
  const providerBuckets: SkillProviderBucket[] = []
  const attention: SkillAttentionBuckets = {
    duplicates: 0,
    missingDescription: 0,
    invalidFrontmatter: 0,
    unsupportedInvocation: 0,
    needsInstall: 0,
    needsAuth: 0,
    disabled: 0,
  }

  let total = 0
  let enabled = 0
  let withWarnings = 0
  let depsNeedingAction = 0

  for (const provider of catalog.providers) {
    providerBuckets.push({
      providerId: provider.providerId,
      providerName: provider.providerName,
      count: provider.skills.length,
      errored: Boolean(provider.error),
      error: provider.error,
    })

    for (const skill of provider.skills) {
      total += 1
      if (skill.enabled) {
        enabled += 1
      }
      if (skill.warnings.length > 0) {
        withWarnings += 1
      }

      const needsInstall = skillHasDependencyState(skill, 'needs-install')
      const needsAuth = skillHasDependencyState(skill, 'needs-auth')
      if (needsInstall || needsAuth) {
        depsNeedingAction += 1
      }
      if (needsInstall) {
        attention.needsInstall += 1
      }
      if (needsAuth) {
        attention.needsAuth += 1
      }
      if (!skill.enabled) {
        attention.disabled += 1
      }
      if (skillHasWarning(skill, 'duplicate-name')) {
        attention.duplicates += 1
      }
      if (skillHasWarning(skill, 'missing-description')) {
        attention.missingDescription += 1
      }
      if (skillHasWarning(skill, 'invalid-frontmatter')) {
        attention.invalidFrontmatter += 1
      }
      if (skillHasWarning(skill, 'unsupported-path-invocation')) {
        attention.unsupportedInvocation += 1
      }

      const origin = scopeOrigin(skill.scope)
      const bucket = originBuckets.get(origin) ?? {
        origin,
        count: 0,
        enabled: 0,
        withWarnings: 0,
      }
      bucket.count += 1
      if (skill.enabled) {
        bucket.enabled += 1
      }
      if (skill.warnings.length > 0) {
        bucket.withWarnings += 1
      }
      originBuckets.set(origin, bucket)
    }
  }

  const originOrder: SkillOrigin[] = ['project', 'global', 'plugin', 'builtin']

  return {
    total,
    enabled,
    disabled: total - enabled,
    withWarnings,
    depsNeedingAction,
    byOrigin: originOrder
      .map((origin) => originBuckets.get(origin))
      .filter((bucket): bucket is SkillOriginBucket => Boolean(bucket)),
    byProvider: providerBuckets
      .filter((bucket) => bucket.count > 0 || bucket.errored)
      .sort((a, b) => b.count - a.count),
    attention,
  }
}
