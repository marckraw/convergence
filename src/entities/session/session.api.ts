import type {
  Session,
  ProviderInfo,
  ProviderStatusInfo,
  ReasoningEffort,
  NeedsYouDismissals,
} from './session.types'

export const sessionApi = {
  create: (input: {
    projectId: string
    workspaceId: string | null
    providerId: string
    model: string | null
    effort: ReasoningEffort | null
    name: string
  }): Promise<Session> => window.electronAPI.session.create(input),

  getByProjectId: (projectId: string): Promise<Session[]> =>
    window.electronAPI.session.getByProjectId(projectId),

  getAll: (): Promise<Session[]> => window.electronAPI.session.getAll(),

  getById: (id: string): Promise<Session | null> =>
    window.electronAPI.session.getById(id),

  archive: (id: string): Promise<void> =>
    window.electronAPI.session.archive(id),

  unarchive: (id: string): Promise<void> =>
    window.electronAPI.session.unarchive(id),

  delete: (id: string): Promise<void> => window.electronAPI.session.delete(id),

  start: (id: string, message: string): Promise<void> =>
    window.electronAPI.session.start(id, message),

  sendMessage: (id: string, text: string): Promise<void> =>
    window.electronAPI.session.sendMessage(id, text),

  approve: (id: string): Promise<void> =>
    window.electronAPI.session.approve(id),

  deny: (id: string): Promise<void> => window.electronAPI.session.deny(id),

  stop: (id: string): Promise<void> => window.electronAPI.session.stop(id),

  rename: (id: string, name: string): Promise<void> =>
    window.electronAPI.session.rename(id, name),

  regenerateName: (id: string): Promise<void> =>
    window.electronAPI.session.regenerateName(id),

  getNeedsYouDismissals: (): Promise<NeedsYouDismissals> =>
    window.electronAPI.session.getNeedsYouDismissals(),

  setNeedsYouDismissals: (dismissals: NeedsYouDismissals): Promise<void> =>
    window.electronAPI.session.setNeedsYouDismissals(dismissals),

  onSessionUpdate: (callback: (session: Session) => void): (() => void) =>
    window.electronAPI.session.onSessionUpdate(callback),
}

export const providerApi = {
  getAll: (): Promise<ProviderInfo[]> => window.electronAPI.provider.getAll(),
  getStatuses: (): Promise<ProviderStatusInfo[]> =>
    window.electronAPI.provider.getStatuses(),
}
