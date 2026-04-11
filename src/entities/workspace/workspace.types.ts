export interface Workspace {
  id: string
  projectId: string
  branchName: string
  path: string
  type: 'worktree'
  createdAt: string
}
