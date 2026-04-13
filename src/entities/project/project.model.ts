import { create } from 'zustand'
import type { Project } from './project.types'
import { projectApi, dialogApi } from './project.api'

interface ProjectState {
  projects: Project[]
  activeProject: Project | null
  loading: boolean
  error: string | null
}

interface ProjectActions {
  loadProjects: () => Promise<void>
  loadActiveProject: () => Promise<void>
  createProject: () => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (id: string) => Promise<void>
  clearError: () => void
}

export type ProjectStore = ProjectState & ProjectActions

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProject: null,
  loading: false,
  error: null,

  loadProjects: async () => {
    const projects = await projectApi.getAll()
    set({ projects })
  },

  loadActiveProject: async () => {
    set({ loading: true, error: null })
    try {
      const active = await projectApi.getActive()
      const projects = await projectApi.getAll()
      set({ activeProject: active, projects, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load project',
      })
    }
  },

  createProject: async () => {
    set({ error: null })
    try {
      const path = await dialogApi.selectDirectory()
      if (!path) return

      const { activeProject, projects: currentProjects } = get()
      const project = await projectApi.create({ repositoryPath: path })
      const projects = await projectApi.getAll()
      const alreadyKnown = currentProjects.some(
        (item) => item.id === project.id,
      )

      set({
        activeProject: alreadyKnown && activeProject ? activeProject : project,
        projects,
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to create project',
      })
    }
  },

  deleteProject: async (id: string) => {
    try {
      await projectApi.delete(id)
      const { activeProject } = get()
      const projects = await projectApi.getAll()
      const newActive =
        activeProject?.id === id ? (projects[0] ?? null) : activeProject

      if (newActive && newActive.id !== activeProject?.id) {
        await projectApi.setActive(newActive.id)
      }

      set({ projects, activeProject: newActive })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete project',
      })
    }
  },

  setActiveProject: async (id: string) => {
    try {
      await projectApi.setActive(id)
      const project = await projectApi.getById(id)
      set({ activeProject: project })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to switch project',
      })
    }
  },

  clearError: () => set({ error: null }),
}))
