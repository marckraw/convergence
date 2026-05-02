import type { ProviderDebugEntry } from './provider-debug.types'

export const providerDebugApi = {
  subscribe: (
    callback: (entry: ProviderDebugEntry) => void,
  ): (() => void) =>
    window.electronAPI.providerDebug?.subscribe?.(callback) ??
    (() => undefined),
  list: async (sessionId: string): Promise<ProviderDebugEntry[]> => {
    const result = await window.electronAPI.providerDebug?.list?.(sessionId)
    return Array.isArray(result) ? result : []
  },
}
