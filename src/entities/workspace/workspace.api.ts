import type {
  BranchOutputFacts,
  GitStatusEntry,
  Workspace,
} from './workspace.types'

export const workspaceApi = {
  create: (input: {
    projectId: string
    branchName: string
    baseBranch?: string | null
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

  getAllBranches: (repoPath: string): Promise<string[]> =>
    window.electronAPI.git.getAllBranches(repoPath),

  getCurrentBranch: (repoPath: string): Promise<string> =>
    window.electronAPI.git.getCurrentBranch(repoPath),

  getBranchOutputFacts: (repoPath: string): Promise<BranchOutputFacts> =>
    window.electronAPI.git.getBranchOutputFacts(repoPath),

  getStatus: (repoPath: string): Promise<GitStatusEntry[]> =>
    window.electronAPI.git.getStatus(repoPath),

  getDiff: (repoPath: string, filePath?: string): Promise<string> =>
    window.electronAPI.git.getDiff(repoPath, filePath),
}
