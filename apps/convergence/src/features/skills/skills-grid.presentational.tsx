import type { FC } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { SkillCatalogEntry } from '@/entities/skill'
import { Badge, Card, CardAction, EmptyState, StatusDot } from '@convergence/ui'
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
    <Card
      key={skill.id}
      interactive
      selected={selected}
      className="flex h-full min-w-0 flex-col rounded-xl"
    >
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <StatusDot
            size="sm"
            tone={skill.enabled ? 'success' : 'neutral'}
            className="shrink-0"
          />
          <CardAction
            onClick={() => onSelectSkill(skill.id)}
            className="truncate text-sm font-medium after:rounded-xl"
          >
            {skill.displayName}
            <span className="sr-only">
              {skill.enabled ? ', enabled' : ', disabled'}
            </span>
          </CardAction>
        </span>
        {skillIsDuplicate(skill) ? (
          <span className="flex shrink-0 text-warning-ink">
            <AlertTriangle aria-hidden className="size-3.5" />
            <span className="sr-only">Duplicate name</span>
          </span>
        ) : null}
      </span>

      <span className="mt-1.5 line-clamp-3 block text-xs leading-5 text-pretty text-ink-muted">
        {skill.shortDescription || skill.description || 'No description.'}
      </span>

      <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-2.5">
        {renderScopeChip(skill.scope)}
        {renderProviderChip(skill.providerName)}
        {renderWarningBadge(skill.warnings.length)}
      </span>
    </Card>
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
      <EmptyState
        title="No skills match these filters"
        detail="Clear the search or widen a filter."
      />
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key}>
          {showGroupHeaders ? (
            <div className="mb-2.5 flex items-center gap-2">
              <h3 className="text-sm font-semibold">{group.label}</h3>
              <Badge shape="count">{group.skills.length}</Badge>
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
