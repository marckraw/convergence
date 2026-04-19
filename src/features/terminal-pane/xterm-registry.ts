const clearFns = new Map<string, () => void>()

export const xtermRegistry = {
  register(tabId: string, clear: () => void): () => void {
    clearFns.set(tabId, clear)
    return () => {
      if (clearFns.get(tabId) === clear) {
        clearFns.delete(tabId)
      }
    }
  },
  clear(tabId: string): boolean {
    const fn = clearFns.get(tabId)
    if (!fn) return false
    fn()
    return true
  },
  has(tabId: string): boolean {
    return clearFns.has(tabId)
  },
}
