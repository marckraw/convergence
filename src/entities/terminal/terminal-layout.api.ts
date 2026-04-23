import type { PersistedPaneTree } from './terminal-layout.types'

export const terminalLayoutApi = {
  get(sessionId: string): Promise<PersistedPaneTree | null> {
    return window.electronAPI.terminalLayout.get(sessionId) as Promise<
      PersistedPaneTree | null
    >
  },
  save(sessionId: string, tree: PersistedPaneTree): Promise<void> {
    return window.electronAPI.terminalLayout.save(sessionId, tree)
  },
  clear(sessionId: string): Promise<void> {
    return window.electronAPI.terminalLayout.clear(sessionId)
  },
}
