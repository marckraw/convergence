import type { Turn, TurnDelta, TurnFileChange } from './turn.types'

export const turnsApi = {
  listForSession: (sessionId: string): Promise<Turn[]> =>
    window.electronAPI.turns.listForSession(sessionId) as Promise<Turn[]>,

  getFileChanges: (turnId: string): Promise<TurnFileChange[]> =>
    window.electronAPI.turns.getFileChanges(turnId) as Promise<
      TurnFileChange[]
    >,

  getFileDiff: (turnId: string, filePath: string): Promise<string> =>
    window.electronAPI.turns.getFileDiff(turnId, filePath),

  onTurnDelta: (callback: (delta: TurnDelta) => void): (() => void) =>
    window.electronAPI.turns.onTurnDelta((payload) =>
      callback(payload as TurnDelta),
    ),
}
