import type { FC } from 'react'
import { useProjectStore } from '@/entities/project'
import { ProjectCreateButton } from './project-create.presentational'

interface ProjectCreateProps {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm'
}

export const ProjectCreate: FC<ProjectCreateProps> = ({
  variant = 'default',
  size = 'default',
}) => {
  const createProject = useProjectStore((s) => s.createProject)

  return (
    <ProjectCreateButton
      onClick={createProject}
      variant={variant}
      size={size}
    />
  )
}
