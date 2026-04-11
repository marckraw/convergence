import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { Plus } from 'lucide-react'

interface ProjectCreateButtonProps {
  onClick: () => void
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm'
}

export const ProjectCreateButton: FC<ProjectCreateButtonProps> = ({
  onClick,
  variant = 'default',
  size = 'default',
}) => (
  <Button variant={variant} size={size} onClick={onClick}>
    <Plus className="h-4 w-4" />
    New Project
  </Button>
)
