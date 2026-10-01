import type { FC } from 'react'
import { Button } from '@convergence/ui'
import { Plus } from 'lucide-react'

interface ProjectCreateButtonProps {
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'lg' | 'md'
}

export const ProjectCreateButton: FC<ProjectCreateButtonProps> = ({
  onClick,
  variant = 'primary',
  size = 'lg',
}) => (
  <Button variant={variant} size={size} onClick={onClick}>
    <Plus className="h-4 w-4" />
    Open a project
  </Button>
)
