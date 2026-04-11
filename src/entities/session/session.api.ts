import type { Session, ProviderInfo } from './session.types'

export const sessionApi = {
  create: (input: {
    projectId: string
    workspaceId: string | null
    providerId: string
    name: string
  }): Promise<Session> => window.electronAPI.session.create(input),

  getByProjectId: (projectId: string): Promise<Session[]> =>
    window.electronAPI.session.getByProjectId(projectId),

  getById: (id: string): Promise<Session | null> =>
    window.electronAPI.session.getById(id),

  delete: (id: string): Promise<void> => window.electronAPI.session.delete(id),

  start: (id: string, message: string): Promise<void> =>
    window.electronAPI.session.start(id, message),

  sendMessage: (id: string, text: string): Promise<void> =>
    window.electronAPI.session.sendMessage(id, text),

  approve: (id: string): Promise<void> =>
    window.electronAPI.session.approve(id),

  deny: (id: string): Promise<void> => window.electronAPI.session.deny(id),

  stop: (id: string): Promise<void> => window.electronAPI.session.stop(id),

  onSessionUpdate: (callback: (session: Session) => void): (() => void) =>
    window.electronAPI.session.onSessionUpdate(callback),
}

export const providerApi = {
  getAll: (): Promise<ProviderInfo[]> => window.electronAPI.provider.getAll(),
}
