import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { SkillCatalogEntry, SkillScope } from '@/entities/skill'
import { cn } from '@/shared/lib/cn.pure'
import {
  SCOPE_LABELS,
  SKILL_ORIGIN_META,
  scopeOrigin,
} from './skills-browser.styles'

const PILL =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide'

/** Origin-coloured pill that answers "where does this skill come from?". */
export function renderScopeChip(
  scope: SkillScope,
  className?: string,
): ReactNode {
  const origin = SKILL_ORIGIN_META[scopeOrigin(scope)]
  return (
    <span
      className={cn(PILL, origin.chipClass, className)}
      title={`${origin.label} · ${origin.hint}`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', origin.dotClass)} />
      {SCOPE_LABELS[scope]}
    </span>
  )
}

export function renderStatusBadge(enabled: boolean): ReactNode {
  if (enabled) {
    return (
      <span
        className={cn(
          PILL,
          'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
        )}
      >
        <CheckCircle2 className="h-3 w-3" />
        Enabled
      </span>
    )
  }

  return (
    <span
      className={cn(PILL, 'border-border/70 bg-muted/50 text-muted-foreground')}
    >
      <XCircle className="h-3 w-3" />
      Disabled
    </span>
  )
}

export function renderWarningBadge(
  count: number,
  className?: string,
): ReactNode {
  if (count === 0) {
    return null
  }

  return (
    <span
      className={cn(
        PILL,
        'border-warning/20 bg-warning/10 text-warning-foreground',
        className,
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      {count}
    </span>
  )
}

export function renderProviderChip(
  name: string,
  className?: string,
): ReactNode {
  return (
    <span
      className={cn(
        PILL,
        'border-border/70 bg-muted/30 text-muted-foreground',
        className,
      )}
    >
      {name}
    </span>
  )
}

export function skillIsDuplicate(skill: SkillCatalogEntry): boolean {
  return skill.warnings.some((warning) => warning.code === 'duplicate-name')
}
