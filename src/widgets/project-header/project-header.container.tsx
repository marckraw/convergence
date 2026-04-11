import type { FC } from 'react'
import { useProjectStore } from '@/entities/project'
import { ProjectCreate } from '@/features/project-create'
import { ProjectHeaderShell } from './project-header.presentational'

export const ProjectHeader: FC = () => {
  const activeProject = useProjectStore((s) => s.activeProject)
  const projects = useProjectStore((s) => s.projects)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)

  if (!activeProject) return null

  return (
    <ProjectHeaderShell
      activeProject={activeProject}
      projects={projects}
      onSwitchProject={setActiveProject}
      onDeleteProject={deleteProject}
      createButton={<ProjectCreate variant="outline" size="sm" />}
    />
  )
}
