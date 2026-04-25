import type { FC } from 'react'
import type { SkillSelection } from '@/entities/skill'
import { Button } from '@/shared/ui/button'
import { Library, X } from 'lucide-react'

interface SkillSelectionChipProps {
  selection: SkillSelection
  onRemove: (skillId: string) => void
}

export const SkillSelectionChip: FC<SkillSelectionChipProps> = ({
  selection,
  onRemove,
}) => (
  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-foreground">
    <Library className="h-3 w-3 shrink-0 text-primary" />
    <span className="min-w-0 truncate">{selection.displayName}</span>
    <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
      {selection.status}
    </span>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-4 w-4 rounded-full text-muted-foreground hover:text-foreground"
      aria-label={`Remove ${selection.displayName}`}
      onClick={() => onRemove(selection.id)}
    >
      <X className="h-3 w-3" />
    </Button>
  </span>
)
