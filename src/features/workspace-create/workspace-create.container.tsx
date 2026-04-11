import { useState } from 'react'
import type { FC } from 'react'
import { useWorkspaceStore } from '@/entities/workspace'
import { WorkspaceCreateForm } from './workspace-create.presentational'

interface WorkspaceCreateProps {
  projectId: string
}

export const WorkspaceCreate: FC<WorkspaceCreateProps> = ({ projectId }) => {
  const [branchName, setBranchName] = useState('')
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)

  const handleSubmit = () => {
    const trimmed = branchName.trim()
    if (!trimmed) return
    createWorkspace(projectId, trimmed)
    setBranchName('')
  }

  return (
    <WorkspaceCreateForm
      branchName={branchName}
      onBranchNameChange={setBranchName}
      onSubmit={handleSubmit}
    />
  )
}
