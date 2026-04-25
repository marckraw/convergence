import { createHash } from 'crypto'
import { resolve } from 'path'
import type {
  ProviderSkillCatalog,
  SkillActivationConfirmation,
  SkillCatalogEntry,
  SkillCatalogSource,
  SkillInvocationSupport,
  SkillProviderId,
  SkillScope,
  SkillWarning,
} from './skills.types'

export interface NormalizedSkillScope {
  scope: SkillScope
  sourceLabel: string
  warning: SkillWarning | null
}

const SCOPE_LABELS: Record<SkillScope, string> = {
  product: 'Product',
  system: 'System',
  global: 'Global',
  user: 'User',
  project: 'Project',
  plugin: 'Plugin',
  admin: 'Admin',
  team: 'Team',
  settings: 'Settings',
  unknown: 'Unknown',
}

export function normalizeSkillScope(rawScope: unknown): NormalizedSkillScope {
  const raw =
    typeof rawScope === 'string' ? rawScope.trim().toLowerCase() : null
  let scope: SkillScope

  switch (raw) {
    case 'repo':
    case 'project':
      scope = 'project'
      break
    case 'user':
      scope = 'user'
      break
    case 'global':
      scope = 'global'
      break
    case 'system':
      scope = 'system'
      break
    case 'admin':
      scope = 'admin'
      break
    case 'plugin':
      scope = 'plugin'
      break
    case 'team':
      scope = 'team'
      break
    case 'settings':
      scope = 'settings'
      break
    case 'product':
      scope = 'product'
      break
    default:
      scope = 'unknown'
      break
  }

  return {
    scope,
    sourceLabel: SCOPE_LABELS[scope],
    warning:
      scope === 'unknown'
        ? {
            code: 'unknown-scope',
            message:
              raw === null
                ? 'Skill source scope was not reported by the provider.'
                : `Skill source scope "${raw}" is not recognized.`,
          }
        : null,
  }
}

export interface BuildSkillCatalogIdInput {
  providerId: SkillProviderId
  name: string
  path: string | null
  scope: SkillScope
  rawScope: string | null
}

export function buildSkillCatalogId(input: BuildSkillCatalogIdInput): string {
  const identity = {
    providerId: input.providerId,
    scope: input.scope,
    rawScope: input.rawScope,
    path: input.path ? resolve(input.path) : null,
    name: input.path ? null : input.name,
  }
  const digest = createHash('sha256')
    .update(JSON.stringify(identity))
    .digest('hex')
    .slice(0, 16)

  return `skill:${input.providerId}:${digest}`
}

function hasWarning(entry: SkillCatalogEntry, code: SkillWarning['code']) {
  return entry.warnings.some((warning) => warning.code === code)
}

export function addDuplicateNameWarnings(
  entries: SkillCatalogEntry[],
): SkillCatalogEntry[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const key = entry.name.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return entries.map((entry) => {
    if ((counts.get(entry.name.toLowerCase()) ?? 0) < 2) {
      return entry
    }
    if (hasWarning(entry, 'duplicate-name')) {
      return entry
    }
    return {
      ...entry,
      warnings: [
        ...entry.warnings,
        {
          code: 'duplicate-name',
          message: `Multiple ${entry.providerName} skills named "${entry.name}" are available.`,
        },
      ],
    }
  })
}

export function buildProviderSkillErrorCatalog(input: {
  providerId: SkillProviderId
  providerName: string
  catalogSource: SkillCatalogSource
  invocationSupport: SkillInvocationSupport
  activationConfirmation: SkillActivationConfirmation
  error: string
}): ProviderSkillCatalog {
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    catalogSource: input.catalogSource,
    invocationSupport: input.invocationSupport,
    activationConfirmation: input.activationConfirmation,
    skills: [],
    error: input.error,
  }
}
