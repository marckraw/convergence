import type { WorkspaceRow } from '../database/database.types'

export interface Workspace {
  id: string
  projectId: string
  branchName: string
  path: string
  type: 'worktree'
  createdAt: string
}

export interface CreateWorkspaceInput {
  projectId: string
  branchName: string
}

export function workspaceFromRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    projectId: row.project_id,
    branchName: row.branch_name,
    path: row.path,
    type: row.type as 'worktree',
    createdAt: row.created_at,
  }
}
