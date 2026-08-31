import type {
  CreateProjectContextItemInput,
  ProjectContextItem,
  UpdateProjectContextItemInput,
} from './project-context.types'

export const projectContextApi = {
  list: (projectId: string): Promise<ProjectContextItem[]> =>
    window.electronAPI.projectContext.list(projectId),

  create: (input: CreateProjectContextItemInput): Promise<ProjectContextItem> =>
    window.electronAPI.projectContext.create(input),

  update: (
    id: string,
    patch: UpdateProjectContextItemInput,
  ): Promise<ProjectContextItem> =>
    window.electronAPI.projectContext.update(id, patch),

  delete: (id: string): Promise<void> =>
    window.electronAPI.projectContext.delete(id),

  attachToSession: (sessionId: string, itemIds: string[]): Promise<void> =>
    window.electronAPI.projectContext.attachToSession(sessionId, itemIds),

  listForSession: (sessionId: string): Promise<ProjectContextItem[]> =>
    window.electronAPI.projectContext.listForSession(sessionId),
}
