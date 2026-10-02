import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { SkillCatalogEntry, SkillScope } from '@/entities/skill'
import { Badge, cn } from '@convergence/ui'
import {
  SCOPE_LABELS,
  SKILL_ORIGIN_META,
  scopeOrigin,
} from './skills-browser.styles'

/**
 * Where a skill comes from: its scope's word, with its origin's dot. The word
 * stays in the badge's own ink, so it reads on a chosen card's fill too (R7);
 * the dot carries the origin's hue.
 */
export function renderScopeChip(scope: SkillScope): ReactNode {
  const origin = SKILL_ORIGIN_META[scopeOrigin(scope)]
  return (
    <Badge
      caps
      className="font-medium"
      icon={<span className={cn('size-1.5 rounded-full', origin.dotClass)} />}
    >
      {SCOPE_LABELS[scope]}
    </Badge>
  )
}

/** Enabled or disabled, as a state (R1). */
export function renderStatusBadge(enabled: boolean): ReactNode {
  return enabled ? (
    <Badge tone="success" icon={<CheckCircle2 />} caps>
      Enabled
    </Badge>
  ) : (
    <Badge icon={<XCircle />} caps>
      Disabled
    </Badge>
  )
}

/**
 * How many warnings a skill has: a neutral count with the warning's glyph in
 * its ink, so it reads on a chosen card's fill too (R7).
 */
export function renderWarningBadge(count: number): ReactNode {
  if (count === 0) {
    return null
  }

  return (
    <Badge
      icon={<AlertTriangle className="text-warning-ink" />}
      className="tabular-nums"
    >
      {count}
      <span className="sr-only">{count === 1 ? ' warning' : ' warnings'}</span>
    </Badge>
  )
}

export function renderProviderChip(name: string): ReactNode {
  return <Badge caps>{name}</Badge>
}

export function skillIsDuplicate(skill: SkillCatalogEntry): boolean {
  return skill.warnings.some((warning) => warning.code === 'duplicate-name')
}
