import type { ProjectOpenApp, ProjectOpenRequest } from './project-open.types'

export const projectOpenApi = {
  listApps: (): Promise<ProjectOpenApp[]> =>
    window.electronAPI.projectOpen?.listApps?.() ?? Promise.resolve([]),
  open: (input: ProjectOpenRequest): Promise<void> => {
    if (!window.electronAPI.projectOpen?.open) {
      return Promise.reject(new Error('Project opening is unavailable.'))
    }

    return window.electronAPI.projectOpen.open(input)
  },
}
