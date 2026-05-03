import { create } from 'zustand'
import { pullRequestApi } from './pull-request.api'
import type { WorkspacePullRequest } from './pull-request.types'

interface PullRequestState {
  byWorkspaceId: Record<string, WorkspacePullRequest>
  loadingByWorkspaceId: Record<string, boolean>
  errorByWorkspaceId: Record<string, string>
}

interface PullRequestActions {
  loadByWorkspaceId: (workspaceId: string) => Promise<void>
  refreshForSession: (
    sessionId: string,
    workspaceId: string | null,
  ) => Promise<void>
  clearWorkspaceError: (workspaceId: string) => void
}

export type PullRequestStore = PullRequestState & PullRequestActions

function withoutKey<T>(
  record: Record<string, T>,
  key: string,
): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => id !== key))
}

export const usePullRequestStore = create<PullRequestStore>((set) => ({
  byWorkspaceId: {},
  loadingByWorkspaceId: {},
  errorByWorkspaceId: {},

  loadByWorkspaceId: async (workspaceId) => {
    try {
      const pullRequest = await pullRequestApi.getByWorkspaceId(workspaceId)
      set((state) => ({
        byWorkspaceId: pullRequest
          ? { ...state.byWorkspaceId, [workspaceId]: pullRequest }
          : withoutKey(state.byWorkspaceId, workspaceId),
      }))
    } catch (err) {
      set((state) => ({
        errorByWorkspaceId: {
          ...state.errorByWorkspaceId,
          [workspaceId]:
            err instanceof Error ? err.message : 'Failed to load PR status',
        },
      }))
    }
  },

  refreshForSession: async (sessionId, workspaceId) => {
    if (!workspaceId) return
    set((state) => ({
      loadingByWorkspaceId: {
        ...state.loadingByWorkspaceId,
        [workspaceId]: true,
      },
      errorByWorkspaceId: withoutKey(state.errorByWorkspaceId, workspaceId),
    }))

    try {
      const pullRequest = await pullRequestApi.refreshForSession(sessionId)
      set((state) => ({
        byWorkspaceId: pullRequest
          ? { ...state.byWorkspaceId, [workspaceId]: pullRequest }
          : withoutKey(state.byWorkspaceId, workspaceId),
        loadingByWorkspaceId: withoutKey(
          state.loadingByWorkspaceId,
          workspaceId,
        ),
      }))
    } catch (err) {
      set((state) => ({
        loadingByWorkspaceId: withoutKey(
          state.loadingByWorkspaceId,
          workspaceId,
        ),
        errorByWorkspaceId: {
          ...state.errorByWorkspaceId,
          [workspaceId]:
            err instanceof Error ? err.message : 'Failed to refresh PR status',
        },
      }))
    }
  },

  clearWorkspaceError: (workspaceId) =>
    set((state) => ({
      errorByWorkspaceId: withoutKey(state.errorByWorkspaceId, workspaceId),
    })),
}))
