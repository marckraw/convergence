import type {
  CodexSpeedScope,
  CodexSpeedSnapshot,
} from '@/shared/types/codex-speed.types'

export const codexSpeedApi = {
  /** Which speeds Codex offers the scope's account, per model (MAR-3574). */
  list: (
    forceRefresh = false,
    scope?: CodexSpeedScope,
  ): Promise<CodexSpeedSnapshot> =>
    window.electronAPI.codexSpeed.list(forceRefresh, scope),
}
