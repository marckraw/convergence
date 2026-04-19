import type { Workspace } from './workspace.types'

export const workspaceApi = {
  create: (input: {
    projectId: string
    branchName: string
  }): Promise<Workspace> => window.electronAPI.workspace.create(input),

  getByProjectId: (projectId: string): Promise<Workspace[]> =>
    window.electronAPI.workspace.getByProjectId(projectId),

  getAll: (): Promise<Workspace[]> => window.electronAPI.workspace.getAll(),

  delete: (id: string): Promise<void> =>
    window.electronAPI.workspace.delete(id),
}

export const gitApi = {
  getBranches: (repoPath: string): Promise<string[]> =>
    window.electronAPI.git.getBranches(repoPath),

  getCurrentBranch: (repoPath: string): Promise<string> =>
    window.electronAPI.git.getCurrentBranch(repoPath),
}
