import type { Turn, TurnDelta, TurnFileChange } from './turn.types'

export const turnsApi = {
  listForSession: (sessionId: string): Promise<Turn[]> =>
    window.electronAPI.turns.listForSession(sessionId) as Promise<Turn[]>,

  getFileChanges: (turnId: string): Promise<TurnFileChange[]> =>
    window.electronAPI.turns.getFileChanges(turnId) as Promise<
      TurnFileChange[]
    >,

  /**
   * `repoRoot` names which repository of the turn the path belongs to; null is
   * the working-directory root. Omitting it asks by turn and path alone, which
   * is the whole answer for a turn that touched one repository (MAR-2589).
   */
  getFileDiff: (
    turnId: string,
    filePath: string,
    repoRoot?: string | null,
  ): Promise<string> =>
    window.electronAPI.turns.getFileDiff(turnId, filePath, repoRoot),

  onTurnDelta: (callback: (delta: TurnDelta) => void): (() => void) =>
    window.electronAPI.turns.onTurnDelta((payload) =>
      callback(payload as TurnDelta),
    ),
}
