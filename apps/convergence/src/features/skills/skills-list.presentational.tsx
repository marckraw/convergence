import type { FC } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { SkillCatalogEntry } from '@/entities/skill'
import { Badge, EmptyState, ListRow, Notice } from '@convergence/ui'
import type { SkillBrowserProviderGroup } from './skills-browser.pure'
import {
  renderScopeChip,
  renderWarningBadge,
  skillIsDuplicate,
} from './skills-chips.presentational'
import { groupHead } from './skills-browser.styles'

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
    <ListRow
      key={skill.id}
      render={<button type="button" onClick={() => onSelectSkill(skill.id)} />}
      selected={selected}
      title={skill.displayName}
      marks={
        <>
          {skillIsDuplicate(skill) ? (
            <span className="flex shrink-0 text-warning-ink">
              <AlertTriangle aria-hidden className="size-3.5" />
              <span className="sr-only">Duplicate name</span>
            </span>
          ) : null}
          {renderScopeChip(skill.scope)}
          {!skill.enabled ? (
            <Badge className="uppercase">Disabled</Badge>
          ) : null}
          {renderWarningBadge(skill.warnings.length)}
        </>
      }
      meta={skill.shortDescription || skill.description || 'No description.'}
    />
  )
}

export const SkillsListPane: FC<SkillsListPaneProps> = ({
  groups,
  selectedSkillId,
  onSelectSkill,
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
    <div className="space-y-4">
      {groups.map((group) => (
        <section
          key={group.providerId}
          className="border-t border-line-soft pt-3 first:border-t-0 first:pt-0"
        >
          <div className={groupHead}>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">
                {group.providerName}
              </h3>
              <p className="text-xs text-ink-muted tabular-nums">
                {group.skills.length} skill
                {group.skills.length === 1 ? '' : 's'}
              </p>
            </div>
            <Badge className="uppercase">
              {group.catalogSource.replace('-', ' ')}
            </Badge>
          </div>

          {group.error ? (
            <Notice tone="danger" title={group.error} className="mb-2" />
          ) : null}

          {group.skills.length > 0 ? (
            <div className="space-y-1">
              {group.skills.map((skill) =>
                renderSkillRow(
                  skill,
                  skill.id === selectedSkillId,
                  onSelectSkill,
                ),
              )}
            </div>
          ) : group.error ? null : (
            <p className="text-sm text-ink-muted">
              No skills match these filters.
            </p>
          )}
        </section>
      ))}
    </div>
  )
}
