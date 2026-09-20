import type {
  DrillCancelResult,
  DrillChange,
  DrillDescription,
  DrillOutcome,
} from './context-drill.types'

/**
 * The renderer's one door to the drill's four channels (MAR-3256 R2).
 *
 * `run` and `cancel` answer with a VALUE on every ending, refusals included
 * -- the backend's R6 choice, preserved all the way up: a rejection would
 * arrive here as a string somebody has to parse to find out which beat
 * stopped, and which beat stopped is the whole of what the surface says next.
 */
export const contextDrillApi = {
  run: (sessionId: string): Promise<DrillOutcome> =>
    window.electronAPI.contextDrill.run(sessionId),

  cancel: (sessionId: string): Promise<DrillCancelResult> =>
    window.electronAPI.contextDrill.cancel(sessionId),

  describe: (sessionId: string): Promise<DrillDescription> =>
    window.electronAPI.contextDrill.describe(sessionId),

  onChanged: (callback: (change: DrillChange) => void): (() => void) =>
    window.electronAPI.contextDrill.onChanged(callback),
}
