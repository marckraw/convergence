import type { FC } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { SkillCatalogEntry } from '@/entities/skill'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import type { SkillGridGroup } from './skills-browser.pure'
import {
  renderProviderChip,
  renderScopeChip,
  renderWarningBadge,
  skillIsDuplicate,
} from './skills-chips.presentational'

interface SkillsGridProps {
  groups: SkillGridGroup[]
  selectedSkillId: string | null
  onSelectSkill: (skillId: string) => void
  /** When false, the single synthetic group header is hidden. */
  showGroupHeaders: boolean
}

function renderSkillCard(
  skill: SkillCatalogEntry,
  selected: boolean,
  onSelectSkill: (skillId: string) => void,
) {
  return (
    <Button
      key={skill.id}
      type="button"
      variant="ghost"
      onClick={() => onSelectSkill(skill.id)}
      className={cn(
        'flex h-full min-w-0 flex-col items-stretch justify-start gap-0 whitespace-normal rounded-xl border p-3 text-left transition-[transform,background-color,border-color] active:scale-[0.96]',
        selected
          ? 'border-primary/40 bg-primary/10'
          : 'border-border/70 hover:border-border hover:bg-muted/30',
      )}
    >
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              skill.enabled ? 'bg-emerald-400' : 'bg-muted-foreground/60',
            )}
            title={skill.enabled ? 'Enabled' : 'Disabled'}
          />
          <span className="truncate text-sm font-medium">
            {skill.displayName}
          </span>
        </span>
        {skillIsDuplicate(skill) ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-foreground" />
        ) : null}
      </span>

      <span className="mt-1.5 line-clamp-3 block text-xs leading-5 text-pretty text-muted-foreground">
        {skill.shortDescription || skill.description || 'No description.'}
      </span>

      <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-2.5">
        {renderScopeChip(skill.scope)}
        {renderProviderChip(skill.providerName)}
        {renderWarningBadge(skill.warnings.length)}
      </span>
    </Button>
  )
}

export const SkillsGrid: FC<SkillsGridProps> = ({
  groups,
  selectedSkillId,
  onSelectSkill,
  showGroupHeaders,
}) => {
  if (groups.length === 0) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        No skills matched these filters.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key}>
          {showGroupHeaders ? (
            <div className="mb-2.5 flex items-center gap-2">
              <h4 className="text-sm font-semibold">{group.label}</h4>
              <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                {group.skills.length}
              </span>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {group.skills.map((skill) =>
              renderSkillCard(
                skill,
                skill.id === selectedSkillId,
                onSelectSkill,
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
