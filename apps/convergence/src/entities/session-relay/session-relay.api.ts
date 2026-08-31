import type {
  ClearRelayHopsResult,
  CreateSessionRelayInput,
  RelayHop,
  SessionRelay,
  UpdateSessionRelayInput,
} from './session-relay.types'

export const sessionRelayApi = {
  list: (): Promise<SessionRelay[]> => window.electronAPI.relay.list(),

  create: (input: CreateSessionRelayInput): Promise<SessionRelay> =>
    window.electronAPI.relay.create(input),

  update: (id: string, patch: UpdateSessionRelayInput): Promise<SessionRelay> =>
    window.electronAPI.relay.update(id, patch),

  delete: (id: string): Promise<void> => window.electronAPI.relay.delete(id),

  arm: (id: string): Promise<SessionRelay> => window.electronAPI.relay.arm(id),

  disarm: (id: string): Promise<SessionRelay> =>
    window.electronAPI.relay.disarm(id),

  listHops: (
    crewId: string,
    limit?: number,
    beforeHopId?: string | null,
  ): Promise<RelayHop[]> =>
    window.electronAPI.relay.listHops(crewId, limit, beforeHopId),

  clearHops: (crewId: string): Promise<ClearRelayHopsResult> =>
    window.electronAPI.relay.clearHops(crewId),

  onUpdated: (callback: (relays: SessionRelay[]) => void): (() => void) =>
    window.electronAPI.relay.onUpdated(callback),

  onHopAppended: (callback: (hop: RelayHop) => void): (() => void) =>
    window.electronAPI.relay.onHopAppended(callback),

  onHopsCleared: (callback: (crewId: string) => void): (() => void) =>
    window.electronAPI.relay.onHopsCleared(callback),
}
