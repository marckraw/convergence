import { useEffect } from 'react'
import type { FC } from 'react'
import type { Project } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { WorkspaceCreate } from '@/features/workspace-create'
import { WorkspaceListShell } from './workspace-list.presentational'

interface WorkspaceListProps {
  project: Project
}

export const WorkspaceList: FC<WorkspaceListProps> = ({ project }) => {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces)
  const loadCurrentBranch = useWorkspaceStore((s) => s.loadCurrentBranch)
  const currentBranch = useWorkspaceStore((s) => s.currentBranch)
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace)

  useEffect(() => {
    loadWorkspaces(project.id)
    loadCurrentBranch(project.repositoryPath)
  }, [project.id, project.repositoryPath, loadWorkspaces, loadCurrentBranch])

  return (
    <WorkspaceListShell
      workspaces={workspaces}
      currentBranch={currentBranch}
      onDelete={(id) => deleteWorkspace(id, project.id)}
      createForm={<WorkspaceCreate projectId={project.id} />}
    />
  )
}
