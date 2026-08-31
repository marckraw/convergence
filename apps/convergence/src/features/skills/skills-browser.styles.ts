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
  /** Pill / chip styling (border + bg + text). */
  chipClass: string
  /** Small status dot styling. */
  dotClass: string
  /** Left accent bar styling for dashboard cards. */
  accentClass: string
}

/** Ordered for display: most local first. */
export const SKILL_ORIGINS: readonly SkillOriginMeta[] = [
  {
    id: 'project',
    label: 'Project',
    hint: 'This folder',
    chipClass: 'border-primary/30 bg-primary/10 text-primary',
    dotClass: 'bg-primary',
    accentClass: 'bg-primary',
  },
  {
    id: 'global',
    label: 'Global',
    hint: 'Your machine',
    chipClass: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    dotClass: 'bg-sky-400',
    accentClass: 'bg-sky-400',
  },
  {
    id: 'plugin',
    label: 'Plugin',
    hint: 'Installed plugin packs',
    chipClass: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
    dotClass: 'bg-violet-400',
    accentClass: 'bg-violet-400',
  },
  {
    id: 'builtin',
    label: 'Built-in',
    hint: 'Provider built-ins',
    chipClass: 'border-border/70 bg-muted/40 text-muted-foreground',
    dotClass: 'bg-muted-foreground',
    accentClass: 'bg-muted-foreground',
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

export const DEPENDENCY_STATE_CLASSES: Record<SkillDependencyState, string> = {
  declared: 'border-border/70 bg-muted/30 text-muted-foreground',
  available: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  'needs-auth': 'border-warning/20 bg-warning/10 text-warning-foreground',
  'needs-install': 'border-sky-500/20 bg-sky-500/10 text-sky-200',
  unknown: 'border-border/70 bg-muted/30 text-muted-foreground',
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
