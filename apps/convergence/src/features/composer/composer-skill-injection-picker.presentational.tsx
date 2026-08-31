import type { FC } from 'react'
import { AlertTriangle, Check, Library, Loader2 } from 'lucide-react'
import {
  hasSkillSelection,
  type SkillCatalogEntry,
  type SkillSelection,
} from '@/entities/skill'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface ComposerSkillInjectionPickerProps {
  open: boolean
  items: SkillCatalogEntry[]
  selectedSkills: SkillSelection[]
  highlightedIndex: number
  activeProviderLabel: string | null
  isLoading: boolean
  error: string | null
  onSelect: (skill: SkillCatalogEntry) => void
  onHover: (index: number) => void
  onDismiss: () => void
}

export const ComposerSkillInjectionPicker: FC<
  ComposerSkillInjectionPickerProps
> = ({
  open,
  items,
  selectedSkills,
  highlightedIndex,
  activeProviderLabel,
  isLoading,
  error,
  onSelect,
  onHover,
  onDismiss,
}) => {
  if (!open) return null

  return (
    <div
      className="absolute right-0 bottom-full left-0 z-50 mb-2 max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      data-testid="composer-skill-injection-picker"
      role="listbox"
    >
      <div className="border-b border-border/70 px-2 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Library className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Skills</span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {activeProviderLabel ?? 'Active provider'}
        </div>
      </div>
      {error ? (
        <div className="px-3 py-2 text-xs text-destructive">{error}</div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading skills...
        </div>
      ) : items.length === 0 ? (
        <div
          className="px-3 py-2 text-xs text-muted-foreground"
          data-testid="composer-skill-injection-empty"
        >
          No matching skills.
        </div>
      ) : (
        items.map((skill, index) => {
          const selected = hasSkillSelection(selectedSkills, skill.id)
          const isActive = index === highlightedIndex
          const warningCount = skill.warnings.length
          return (
            <Button
              key={skill.id}
              type="button"
              variant="ghost"
              role="option"
              aria-selected={isActive}
              disabled={!skill.enabled}
              onMouseEnter={() => onHover(index)}
              onClick={() => onSelect(skill)}
              data-testid={`composer-skill-injection-item-${skill.id}`}
              className={cn(
                'flex h-auto w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs',
                isActive && 'bg-accent text-accent-foreground',
                selected && 'border border-primary/30 bg-primary/10',
              )}
            >
              <span className="flex w-full min-w-0 items-center gap-1.5">
                <span className="truncate font-medium">
                  {skill.displayName}
                </span>
                {selected ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : null}
                {warningCount > 0 ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-foreground" />
                ) : null}
                {!skill.enabled ? (
                  <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground">
                    Disabled
                  </span>
                ) : null}
              </span>
              <span className="line-clamp-2 w-full text-[11px] text-muted-foreground">
                {skill.shortDescription ||
                  skill.description ||
                  'No description.'}
              </span>
            </Button>
          )
        })
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        className="sr-only"
        aria-label="Close skill injection picker"
      >
        Close
      </Button>
    </div>
  )
}
