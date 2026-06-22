import type { FC } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { SkillCatalogEntry } from '@/entities/skill'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import type { SkillBrowserProviderGroup } from './skills-browser.pure'
import {
  renderScopeChip,
  renderWarningBadge,
  skillIsDuplicate,
} from './skills-chips.presentational'

interface SkillsListPaneProps {
  groups: SkillBrowserProviderGroup[]
  selectedSkillId: string | null
  onSelectSkill: (skillId: string) => void
}

function renderSkillRow(
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
        'h-auto w-full justify-start rounded-lg border border-transparent px-3 py-2 text-left',
        selected
          ? 'border-primary/30 bg-primary/10 text-foreground'
          : 'hover:border-border/70 hover:bg-muted/40',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">
            {skill.displayName}
          </span>
          {skillIsDuplicate(skill) ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-foreground" />
          ) : null}
        </span>
        <span className="mt-1 line-clamp-2 block whitespace-normal text-xs font-normal leading-5 text-pretty text-muted-foreground">
          {skill.shortDescription || skill.description || 'No description.'}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          {renderScopeChip(skill.scope)}
          {!skill.enabled ? (
            <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Disabled
            </span>
          ) : null}
          {renderWarningBadge(skill.warnings.length)}
        </span>
      </span>
    </Button>
  )
}

export const SkillsListPane: FC<SkillsListPaneProps> = ({
  groups,
  selectedSkillId,
  onSelectSkill,
}) => {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No skills matched these filters.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section
          key={group.providerId}
          className="border-t border-border/60 pt-3 first:border-t-0 first:pt-0"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {group.providerName}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {group.skills.length} skill
                {group.skills.length === 1 ? '' : 's'}
              </p>
            </div>
            <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {group.catalogSource.replace('-', ' ')}
            </span>
          </div>

          {group.error ? (
            <div className="mb-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {group.error}
            </div>
          ) : null}

          {group.skills.length > 0 ? (
            <div className="space-y-2">
              {group.skills.map((skill) =>
                renderSkillRow(
                  skill,
                  skill.id === selectedSkillId,
                  onSelectSkill,
                ),
              )}
            </div>
          ) : group.error ? null : (
            <p className="text-sm text-muted-foreground">
              No skills matched these filters.
            </p>
          )}
        </section>
      ))}
    </div>
  )
}
