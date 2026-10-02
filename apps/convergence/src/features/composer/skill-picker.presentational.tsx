import type { FC } from 'react'
import {
  composerSkillListState,
  hasSkillSelection,
  SkillListStatus,
  SkillRow,
  type SkillCatalogEntry,
  type SkillSelection,
} from '@/entities/skill'
import {
  Badge,
  Button,
  Card,
  CardAction,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchField,
} from '@convergence/ui'
import { Library } from 'lucide-react'
import { pickPopover, pickRowAction, pickRowClass } from './pick-row.styles'

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
}) => {
  // One list's words and looks for loading, failed and empty (CONV-10).
  const listState = composerSkillListState({
    error,
    isLoading,
    count: skills.length,
    query,
  })
  return (
    <Popover open={open} onOpenChange={(open) => onOpenChange(open)}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="quiet"
            aria-label="Select skills"
            disabled={disabled}
            size="md"
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
          {listState.kind === 'listed' ? (
            <div className="space-y-1">
              {skills.map((skill) => {
                const selected = hasSkillSelection(selectedSkills, skill.id)
                return (
                  <Card
                    key={skill.id}
                    interactive
                    padding="none"
                    className={pickRowClass(selected)}
                  >
                    <CardAction
                      disabled={!skill.enabled}
                      aria-pressed={selected}
                      onClick={() => onToggleSkill(skill)}
                      className={pickRowAction}
                    >
                      <SkillRow skill={skill} selected={selected} form="full" />
                    </CardAction>
                  </Card>
                )
              })}
            </div>
          ) : (
            <SkillListStatus state={listState} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
