import { create } from 'zustand'
import type { Workspace } from './workspace.types'
import { workspaceApi, gitApi } from './workspace.api'

interface WorkspaceState {
  workspaces: Workspace[]
  globalWorkspaces: Workspace[]
  currentBranch: string | null
  loading: boolean
  error: string | null
}

interface WorkspaceActions {
  loadWorkspaces: (projectId: string) => Promise<void>
  loadGlobalWorkspaces: () => Promise<void>
  loadCurrentBranch: (repoPath: string) => Promise<void>
  createWorkspace: (
    projectId: string,
    branchName: string,
    baseBranch?: string | null,
  ) => Promise<Workspace | null>
  archiveWorkspace: (
    id: string,
    projectId: string,
    removeWorktree?: boolean,
  ) => Promise<void>
  unarchiveWorkspace: (id: string, projectId: string) => Promise<void>
  removeWorkspaceWorktree: (id: string, projectId: string) => Promise<void>
  deleteWorkspace: (id: string, projectId: string) => Promise<void>
  clearError: () => void
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  globalWorkspaces: [],
  currentBranch: null,
  loading: false,
  error: null,

  loadWorkspaces: async (projectId: string) => {
    const workspaces = await workspaceApi.getByProjectId(projectId)
    set({ workspaces })
  },

  loadGlobalWorkspaces: async () => {
    try {
      const globalWorkspaces = await workspaceApi.getAll()
      set({ globalWorkspaces })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load workspaces',
      })
    }
  },

  loadCurrentBranch: async (repoPath: string) => {
    try {
      const branch = await gitApi.getCurrentBranch(repoPath)
      set({ currentBranch: branch })
    } catch {
      set({ currentBranch: null })
    }
  },

  createWorkspace: async (
    projectId: string,
    branchName: string,
    baseBranch?: string | null,
  ) => {
    set({ error: null })
    try {
      const created = await workspaceApi.create({
        projectId,
        branchName,
        baseBranch,
      })
      const [workspaces, globalWorkspaces] = await Promise.all([
        workspaceApi.getByProjectId(projectId),
        workspaceApi.getAll(),
      ])
      set({ workspaces, globalWorkspaces })
      return created
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to create workspace',
      })
      return null
    }
  },

  archiveWorkspace: async (
    id: string,
    projectId: string,
    removeWorktree?: boolean,
  ) => {
    try {
      await workspaceApi.archive({ id, removeWorktree })
      const [workspaces, globalWorkspaces] = await Promise.all([
        workspaceApi.getByProjectId(projectId),
        workspaceApi.getAll(),
      ])
      set({ workspaces, globalWorkspaces })
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to archive workspace',
      })
    }
  },

  unarchiveWorkspace: async (id: string, projectId: string) => {
    try {
      await workspaceApi.unarchive(id)
      const [workspaces, globalWorkspaces] = await Promise.all([
        workspaceApi.getByProjectId(projectId),
        workspaceApi.getAll(),
      ])
      set({ workspaces, globalWorkspaces })
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to unarchive workspace',
      })
    }
  },

  removeWorkspaceWorktree: async (id: string, projectId: string) => {
    try {
      await workspaceApi.removeWorktree(id)
      const [workspaces, globalWorkspaces] = await Promise.all([
        workspaceApi.getByProjectId(projectId),
        workspaceApi.getAll(),
      ])
      set({ workspaces, globalWorkspaces })
    } catch (err) {
      set({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to remove workspace worktree',
      })
    }
  },

  deleteWorkspace: async (id: string, projectId: string) => {
    try {
      await workspaceApi.delete(id)
      const [workspaces, globalWorkspaces] = await Promise.all([
        workspaceApi.getByProjectId(projectId),
        workspaceApi.getAll(),
      ])
      set({ workspaces, globalWorkspaces })
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to delete workspace',
      })
    }
  },

  clearError: () => set({ error: null }),
}))
