import type { FC } from 'react'
import type { SkillCatalogEntry, SkillSelection } from '@/entities/skill'
import { hasSkillSelection } from '@/entities/skill'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { cn } from '@/shared/lib/cn.pure'
import { AlertTriangle, Check, Library, Loader2, Search } from 'lucide-react'

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
  disabled?: boolean
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
      className={cn(
        'h-auto w-full justify-start rounded-lg border border-transparent px-3 py-2 text-left',
        selected
          ? 'border-primary/30 bg-primary/10 text-foreground'
          : 'hover:border-border/70 hover:bg-muted/40',
      )}
      onClick={() => onToggleSkill(skill)}
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">
            {skill.displayName}
          </span>
          {selected ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
          {warningCount > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-foreground" />
          ) : null}
        </span>
        <span className="mt-1 line-clamp-2 block whitespace-normal text-xs font-normal leading-5 text-muted-foreground">
          {skill.shortDescription || skill.description || 'No description.'}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
            {skill.sourceLabel}
          </span>
          <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
            {skill.providerName}
          </span>
          {!skill.enabled ? (
            <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
              Disabled
            </span>
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
  disabled = false,
  onToggleSkill,
  onBrowseAll,
}) => (
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        aria-label="Select skills"
        disabled={disabled}
      >
        <Library className="h-3.5 w-3.5" />
        Skills
        {selectedSkills.length > 0 ? (
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
            {selectedSkills.length}
          </span>
        ) : null}
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      className="w-[min(390px,calc(100vw-2rem))] p-0"
    >
      <div className="border-b border-border/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Skills</p>
            <p className="truncate text-xs text-muted-foreground">
              {activeProviderLabel ?? 'Active provider'}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onBrowseAll}>
            Browse all
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="Search skills"
            className="pl-8"
          />
        </div>
      </div>

      <div className="app-scrollbar max-h-80 overflow-y-auto p-2">
        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading skills...
          </div>
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
          <p className="px-2 py-3 text-sm text-muted-foreground">
            No skills matched this provider.
          </p>
        )}
      </div>
    </PopoverContent>
  </Popover>
)
