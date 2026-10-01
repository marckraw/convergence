import type { FC } from 'react'
import type { SkillSelection } from '@/entities/skill'
import { Chip } from '@convergence/ui'
import { Library } from 'lucide-react'

interface SkillSelectionChipProps {
  selection: SkillSelection
  onRemove: (skillId: string) => void
}

/** A skill going with the next message: the attached-item Chip (CONV-15). */
export const SkillSelectionChip: FC<SkillSelectionChipProps> = ({
  selection,
  onRemove,
}) => (
  <Chip
    icon={<Library />}
    onRemove={() => onRemove(selection.id)}
    removeLabel={`Remove ${selection.displayName}`}
  >
    {selection.displayName}
    <span className="ml-1.5 text-3xs uppercase">{selection.status}</span>
  </Chip>
)
