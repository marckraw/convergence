import type { FC } from 'react'
import { useDialogStore } from '@/entities/dialog'
import { ProjectCreateButton } from './project-create.presentational'

interface ProjectCreateProps {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'lg' | 'md'
}

export const ProjectCreate: FC<ProjectCreateProps> = ({
  variant = 'primary',
  size = 'lg',
}) => {
  const openDialog = useDialogStore((s) => s.open)

  return (
    <ProjectCreateButton
      onClick={() => openDialog('project-create')}
      variant={variant}
      size={size}
    />
  )
}
