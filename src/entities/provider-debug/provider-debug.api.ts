import type { ProviderDebugEntry } from './provider-debug.types'

export const providerDebugApi = {
  subscribe: (
    sessionId: string,
    callback: (entry: ProviderDebugEntry) => void,
  ): (() => void) =>
    window.electronAPI.providerDebug?.subscribe?.(sessionId, callback) ??
    (() => undefined),
  list: async (sessionId: string): Promise<ProviderDebugEntry[]> => {
    const result = await window.electronAPI.providerDebug?.list?.(sessionId)
    return Array.isArray(result) ? result : []
  },
  openFolder: async (): Promise<boolean> => {
    const ok = await window.electronAPI.providerDebug?.openFolder?.()
    return ok === true
  },
}
