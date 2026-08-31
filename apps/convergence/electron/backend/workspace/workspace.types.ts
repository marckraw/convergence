import type { WorkspaceRow } from '../database/database.types'

export interface Workspace {
  id: string
  projectId: string
  branchName: string
  path: string
  type: 'worktree'
  archivedAt: string | null
  worktreeRemovedAt: string | null
  createdAt: string
}

export interface CreateWorkspaceInput {
  projectId: string
  branchName: string
  baseBranch?: string | null
}

export function workspaceFromRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    projectId: row.project_id,
    branchName: row.branch_name,
    path: row.path,
    type: row.type as 'worktree',
    archivedAt: row.archived_at,
    worktreeRemovedAt: row.worktree_removed_at,
    createdAt: row.created_at,
  }
}
