import type {
  CreateSessionCrewInput,
  SessionCrew,
  UpdateSessionCrewInput,
} from './session-crew.types'

export const sessionCrewApi = {
  export: (
    crewId: string,
    options: { includePositions?: boolean; force?: boolean },
  ): Promise<{ path: string; yaml: string }> =>
    window.electronAPI.crew.export(crewId, options),
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

  setMemberBatonName: (
    crewId: string,
    sessionId: string,
    batonName: string | null,
  ): Promise<SessionCrew> =>
    window.electronAPI.crew.setMemberBatonName(crewId, sessionId, batonName),

  /**
   * Remembers where a card was dropped, or puts it back under the automatic
   * layout with `null`. A position, and nothing else: moving a card never
   * sends a message.
   */
  setMemberPosition: (
    crewId: string,
    sessionId: string,
    position: { x: number; y: number } | null,
  ): Promise<SessionCrew> =>
    window.electronAPI.crew.setMemberPosition(crewId, sessionId, position),

  onUpdated: (callback: (crews: SessionCrew[]) => void): (() => void) =>
    window.electronAPI.crew.onUpdated(callback),
}
