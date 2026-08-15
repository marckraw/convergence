import type {
  CreateSessionCrewInput,
  SessionCrew,
  UpdateSessionCrewInput,
} from './session-crew.types'

export const sessionCrewApi = {
  list: (): Promise<SessionCrew[]> => window.electronAPI.crew.list(),

  create: (input: CreateSessionCrewInput): Promise<SessionCrew> =>
    window.electronAPI.crew.create(input),

  update: (id: string, patch: UpdateSessionCrewInput): Promise<SessionCrew> =>
    window.electronAPI.crew.update(id, patch),

  delete: (id: string): Promise<void> => window.electronAPI.crew.delete(id),

  addMember: (crewId: string, sessionId: string): Promise<SessionCrew> =>
    window.electronAPI.crew.addMember(crewId, sessionId),

  removeMember: (crewId: string, sessionId: string): Promise<SessionCrew> =>
    window.electronAPI.crew.removeMember(crewId, sessionId),

  onUpdated: (callback: (crews: SessionCrew[]) => void): (() => void) =>
    window.electronAPI.crew.onUpdated(callback),
}
