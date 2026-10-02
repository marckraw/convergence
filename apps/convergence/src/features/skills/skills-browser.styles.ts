import type { Tone } from '@convergence/ui'
import type {
  ProjectSkillCatalog,
  SkillDependencyState,
  SkillScope,
} from '@/entities/skill'

/**
 * Origin is the user-facing answer to "where does this skill come from?".
 * It collapses the many provider scopes into the four buckets people reason
 * about: the project folder, their machine, installed plugin packs, and
 * provider built-ins.
 */
export type SkillOrigin = 'project' | 'global' | 'plugin' | 'builtin'

export const SCOPE_LABELS: Record<SkillScope, string> = {
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

export const SKILL_ORIGIN_BY_SCOPE: Record<SkillScope, SkillOrigin> = {
  project: 'project',
  user: 'global',
  global: 'global',
  plugin: 'plugin',
  product: 'builtin',
  system: 'builtin',
  admin: 'builtin',
  team: 'builtin',
  settings: 'builtin',
  unknown: 'builtin',
}

export interface SkillOriginMeta {
  id: SkillOrigin
  label: string
  hint: string
  /**
   * Its hue (R1, a category): the dot in its chip and the bar on its
   * dashboard card. The project's is the strong ink, the others tag hues.
   */
  dotClass: string
}

/** Ordered for display: most local first. */
export const SKILL_ORIGINS: readonly SkillOriginMeta[] = [
  {
    id: 'project',
    label: 'Project',
    hint: 'This folder',
    dotClass: 'bg-strong',
  },
  {
    id: 'global',
    label: 'Global',
    hint: 'Your machine',
    dotClass: 'bg-tag-sky',
  },
  {
    id: 'plugin',
    label: 'Plugin',
    hint: 'Installed plugin packs',
    dotClass: 'bg-tag-violet',
  },
  {
    id: 'builtin',
    label: 'Built-in',
    hint: 'Provider built-ins',
    dotClass: 'bg-ink-muted',
  },
]

export const SKILL_ORIGIN_META: Record<SkillOrigin, SkillOriginMeta> =
  SKILL_ORIGINS.reduce(
    (acc, meta) => {
      acc[meta.id] = meta
      return acc
    },
    {} as Record<SkillOrigin, SkillOriginMeta>,
  )

export function scopeOrigin(scope: SkillScope): SkillOrigin {
  return SKILL_ORIGIN_BY_SCOPE[scope] ?? 'builtin'
}

export const DEPENDENCY_STATE_LABELS: Record<SkillDependencyState, string> = {
  declared: 'Declared',
  available: 'Available',
  'needs-auth': 'Needs auth',
  'needs-install': 'Needs install',
  unknown: 'Unknown',
}

/** What a dependency's state says (R1): ready, waiting on you, or a heads-up. */
export const DEPENDENCY_STATE_TONES: Record<SkillDependencyState, Tone> = {
  declared: 'neutral',
  available: 'success',
  'needs-auth': 'warning',
  'needs-install': 'info',
  unknown: 'neutral',
}

export const CATALOG_SOURCE_LABELS: Record<
  ProjectSkillCatalog['providers'][number]['catalogSource'],
  string
> = {
  'native-rpc': 'Native RPC',
  'native-cli': 'Native CLI',
  filesystem: 'Filesystem',
  unsupported: 'Unsupported',
}

export const INVOCATION_SUPPORT_LABELS: Record<
  ProjectSkillCatalog['providers'][number]['invocationSupport'],
  string
> = {
  'structured-input': 'Structured input',
  'native-command': 'Native command',
  unsupported: 'Unsupported',
}

export const ACTIVATION_CONFIRMATION_LABELS: Record<
  ProjectSkillCatalog['providers'][number]['activationConfirmation'],
  string
> = {
  'native-event': 'Native event',
  none: 'None',
}
