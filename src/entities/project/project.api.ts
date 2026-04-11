import type { Project } from './project.types'

export const projectApi = {
  create: (input: {
    repositoryPath: string
    name?: string
  }): Promise<Project> => window.electronAPI.project.create(input),

  getAll: (): Promise<Project[]> => window.electronAPI.project.getAll(),

  getById: (id: string): Promise<Project | null> =>
    window.electronAPI.project.getById(id),

  delete: (id: string): Promise<void> => window.electronAPI.project.delete(id),

  getActive: (): Promise<Project | null> =>
    window.electronAPI.project.getActive(),

  setActive: (id: string): Promise<void> =>
    window.electronAPI.project.setActive(id),
}

export const dialogApi = {
  selectDirectory: (): Promise<string | null> =>
    window.electronAPI.dialog.selectDirectory(),
}
