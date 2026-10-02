import type { FC } from 'react'
import type { SkillCatalogEntry, SkillSelection } from '@/entities/skill'
import { hasSkillSelection } from '@/entities/skill'
import {
  Badge,
  Button,
  cn,
  EmptyState,
  Notice,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchField,
} from '@convergence/ui'
import { AlertTriangle, Check, Library } from 'lucide-react'
import { pickPopover, pickRowClass, pickRowDetail } from './pick-row.styles'

interface SkillPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (query: string) => void
  skills: SkillCatalogEntry[]
  selectedSkills: SkillSelection[]
  activeProviderLabel: string | null
  isLoading: boolean
  error: string | null
  /** Null on this Mac. A sentence when the list was read for another machine. */
  notice: string | null
  disabled?: boolean
  triggerClassName?: string
  onToggleSkill: (skill: SkillCatalogEntry) => void
  onBrowseAll: () => void
}

function renderSkillRow(
  skill: SkillCatalogEntry,
  selected: boolean,
  onToggleSkill: (skill: SkillCatalogEntry) => void,
) {
  const canSelect = skill.enabled
  const warningCount = skill.warnings.length

  return (
    <Button
      key={skill.id}
      type="button"
      variant="ghost"
      disabled={!canSelect}
      aria-pressed={selected}
      onClick={() => onToggleSkill(skill)}
      size="lg"
      className={pickRowClass(selected)}
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">
            {skill.displayName}
          </span>
          {selected ? <Check aria-hidden className="size-3.5" /> : null}
          {warningCount > 0 ? (
            <AlertTriangle
              aria-hidden
              className="size-3.5 shrink-0 text-warning-ink"
            />
          ) : null}
        </span>
        <span className={pickRowDetail}>
          {skill.shortDescription || skill.description || 'No description.'}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge className="uppercase">{skill.sourceLabel}</Badge>
          <Badge className="uppercase">{skill.providerName}</Badge>
          {!skill.enabled ? (
            <Badge className="uppercase">Disabled</Badge>
          ) : null}
        </span>
      </span>
    </Button>
  )
}

export const SkillPicker: FC<SkillPickerProps> = ({
  open,
  onOpenChange,
  query,
  onQueryChange,
  skills,
  selectedSkills,
  activeProviderLabel,
  isLoading,
  error,
  notice,
  disabled = false,
  triggerClassName,
  onToggleSkill,
  onBrowseAll,
}) => (
  <Popover open={open} onOpenChange={(open) => onOpenChange(open)}>
    <PopoverTrigger
      render={
        <Button
          type="button"
          variant="quiet"
          aria-label="Select skills"
          disabled={disabled}
          size="sm"
          className={triggerClassName}
        >
          <Library className="h-3.5 w-3.5" />
          Skills
          {selectedSkills.length > 0 ? (
            <Badge shape="count">{selectedSkills.length}</Badge>
          ) : null}
        </Button>
      }
    />
    <PopoverContent
      aria-label="Skills"
      align="start"
      className={cn('w-96', pickPopover)}
    >
      <div className="border-b border-line-soft p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Skills</p>
            <p className="truncate text-xs text-ink-muted">
              {activeProviderLabel ?? 'Active provider'}
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={onBrowseAll}>
            Browse all
          </Button>
        </div>
        <SearchField
          size="lg"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="Search skills"
          aria-label="Search skills"
        />
      </div>

      <div className="max-h-80 overflow-y-auto p-2">
        {notice ? (
          <p
            className="px-2 py-1.5 text-xs text-ink-muted"
            data-testid="remote-skills-notice"
          >
            {notice}
          </p>
        ) : null}
        {error ? (
          <Notice tone="danger" title="Couldn't load skills">
            {error}
          </Notice>
        ) : isLoading ? (
          <EmptyState
            state="loading"
            variant="plain"
            size="compact"
            title="Loading skills…"
          />
        ) : skills.length > 0 ? (
          <div className="space-y-1">
            {skills.map((skill) =>
              renderSkillRow(
                skill,
                hasSkillSelection(selectedSkills, skill.id),
                onToggleSkill,
              ),
            )}
          </div>
        ) : (
          <EmptyState
            variant="plain"
            size="compact"
            title="No skills match this provider"
          />
        )}
      </div>
    </PopoverContent>
  </Popover>
)
