import { create } from 'zustand'
import { projectContextApi } from './project-context.api'
import type {
  CreateProjectContextItemInput,
  ProjectContextItem,
  UpdateProjectContextItemInput,
} from './project-context.types'

interface ProjectContextState {
  itemsByProjectId: Record<string, ProjectContextItem[]>
  attachmentsBySessionId: Record<string, ProjectContextItem[]>
  loading: boolean
  error: string | null
}

interface ProjectContextActions {
  loadForProject: (projectId: string) => Promise<void>
  createItem: (
    input: CreateProjectContextItemInput,
  ) => Promise<ProjectContextItem | null>
  updateItem: (
    id: string,
    patch: UpdateProjectContextItemInput,
  ) => Promise<ProjectContextItem | null>
  deleteItem: (id: string, projectId: string) => Promise<void>
  attachToSession: (sessionId: string, itemIds: string[]) => Promise<void>
  loadForSession: (sessionId: string) => Promise<void>
  clearError: () => void
}

export type ProjectContextStore = ProjectContextState & ProjectContextActions

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [...items, next]
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id)
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export const useProjectContextStore = create<ProjectContextStore>((set) => ({
  itemsByProjectId: {},
  attachmentsBySessionId: {},
  loading: false,
  error: null,

  loadForProject: async (projectId) => {
    set({ loading: true, error: null })
    try {
      const items = await projectContextApi.list(projectId)
      set((state) => ({
        itemsByProjectId: { ...state.itemsByProjectId, [projectId]: items },
        loading: false,
      }))
    } catch (err) {
      set({
        loading: false,
        error: errorMessage(err, 'Failed to load project context'),
      })
    }
  },

  createItem: async (input) => {
    set({ error: null })
    try {
      const created = await projectContextApi.create(input)
      set((state) => ({
        itemsByProjectId: {
          ...state.itemsByProjectId,
          [input.projectId]: upsertById(
            state.itemsByProjectId[input.projectId] ?? [],
            created,
          ),
        },
      }))
      return created
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to create context item') })
      return null
    }
  },

  updateItem: async (id, patch) => {
    set({ error: null })
    try {
      const updated = await projectContextApi.update(id, patch)
      set((state) => ({
        itemsByProjectId: {
          ...state.itemsByProjectId,
          [updated.projectId]: upsertById(
            state.itemsByProjectId[updated.projectId] ?? [],
            updated,
          ),
        },
        attachmentsBySessionId: Object.fromEntries(
          Object.entries(state.attachmentsBySessionId).map(
            ([sessionId, items]) => [
              sessionId,
              items.map((item) => (item.id === updated.id ? updated : item)),
            ],
          ),
        ),
      }))
      return updated
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to update context item') })
      return null
    }
  },

  deleteItem: async (id, projectId) => {
    set({ error: null })
    try {
      await projectContextApi.delete(id)
      set((state) => ({
        itemsByProjectId: {
          ...state.itemsByProjectId,
          [projectId]: removeById(state.itemsByProjectId[projectId] ?? [], id),
        },
        attachmentsBySessionId: Object.fromEntries(
          Object.entries(state.attachmentsBySessionId).map(
            ([sessionId, items]) => [sessionId, removeById(items, id)],
          ),
        ),
      }))
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to delete context item') })
    }
  },

  attachToSession: async (sessionId, itemIds) => {
    set({ error: null })
    try {
      await projectContextApi.attachToSession(sessionId, itemIds)
      const items = await projectContextApi.listForSession(sessionId)
      set((state) => ({
        attachmentsBySessionId: {
          ...state.attachmentsBySessionId,
          [sessionId]: items,
        },
      }))
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to attach context to session') })
    }
  },

  loadForSession: async (sessionId) => {
    set({ error: null })
    try {
      const items = await projectContextApi.listForSession(sessionId)
      set((state) => ({
        attachmentsBySessionId: {
          ...state.attachmentsBySessionId,
          [sessionId]: items,
        },
      }))
    } catch (err) {
      set({
        error: errorMessage(err, 'Failed to load session context attachments'),
      })
    }
  },

  clearError: () => set({ error: null }),
}))
