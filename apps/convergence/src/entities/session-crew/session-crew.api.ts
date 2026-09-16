import type {
  CrewImportPlan,
  CrewImportDecisions,
  CrewImportReport,
} from '@/shared/types/crew-import.types'
import type {
  CreateSessionCrewInput,
  SessionCrew,
  UpdateSessionCrewInput,
} from './session-crew.types'

/**
 * How the renderer names one member: a conversation by its session id, a
 * recipe by its baton name (MAR-3083 R3).
 */
export type CrewMemberRef = { sessionId: string } | { batonName: string }

export const sessionCrewApi = {
  importPlan: (
    path?: string,
    choices: Record<string, string> = {},
    updates: Record<string, boolean> = {},
  ): Promise<CrewImportPlan | null> =>
    window.electronAPI.crew.importPlan(path, choices, updates),
  importApply: (
    path: string,
    decisions: CrewImportDecisions,
  ): Promise<CrewImportReport> =>
    window.electronAPI.crew.importApply(path, decisions),
  export: (
    crewId: string,
    options: { includePositions?: boolean },
  ): Promise<{ path: string; yaml: string } | null> =>
    window.electronAPI.crew.export(crewId, options),
  list: (): Promise<SessionCrew[]> => window.electronAPI.crew.list(),

  create: (input: CreateSessionCrewInput): Promise<SessionCrew> =>
    window.electronAPI.crew.create(input),

  update: (id: string, patch: UpdateSessionCrewInput): Promise<SessionCrew> =>
    window.electronAPI.crew.update(id, patch),

  delete: (id: string): Promise<void> => window.electronAPI.crew.delete(id),

  addMember: (crewId: string, sessionId: string): Promise<SessionCrew> =>
    window.electronAPI.crew.addMember(crewId, sessionId),

  removeMember: (crewId: string, member: CrewMemberRef): Promise<SessionCrew> =>
    window.electronAPI.crew.removeMember(crewId, member),

  /**
   * A seat that is a recipe rather than a conversation (MAR-3083 R3). It has
   * no session id, so every write below names it by its baton name.
   */
  addRecipeMember: (
    crewId: string,
    input: {
      batonName: string
      providerId: string
      model: string | null
      hostPolicy: string
      role?: string | null
      roleCard?: string | null
      lanePolicy?: string | null
      wipLimit?: number | null
    },
  ): Promise<SessionCrew> =>
    window.electronAPI.crew.addRecipeMember(crewId, input),

  setMemberSeat: (
    crewId: string,
    member: CrewMemberRef,
    patch: {
      role?: string | null
      kind?: string | null
      roleCard?: string | null
      hostPolicy?: string | null
      lanePolicy?: string | null
      wipLimit?: number | null
    },
  ): Promise<SessionCrew> =>
    window.electronAPI.crew.setMemberSeat(crewId, member, patch),
  setMemberBatonName: (
    crewId: string,
    member: CrewMemberRef,
    batonName: string | null,
  ): Promise<SessionCrew> =>
    window.electronAPI.crew.setMemberBatonName(crewId, member, batonName),

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
