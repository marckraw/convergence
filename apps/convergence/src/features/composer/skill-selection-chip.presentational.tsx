import type { FC } from 'react'
import type { SkillSelection } from '@/entities/skill'
import { IconButton } from '@convergence/ui'
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
    <IconButton
      label={`Remove ${selection.displayName}`}
      type="button"
      variant="quiet"
      onClick={() => onRemove(selection.id)}
      size="xs"
      className="rounded-full"
    >
      <X className="h-3 w-3" />
    </IconButton>
  </span>
)
