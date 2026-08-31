import type { FC } from 'react'
import { useDialogStore } from '@/entities/dialog'
import { ProjectCreateButton } from './project-create.presentational'

interface ProjectCreateProps {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm'
}

export const ProjectCreate: FC<ProjectCreateProps> = ({
  variant = 'default',
  size = 'default',
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
