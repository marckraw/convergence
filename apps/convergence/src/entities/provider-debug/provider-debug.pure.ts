import type { ProviderDebugEntry } from './provider-debug.types'

export const PROVIDER_DEBUG_BUFFER_CAPACITY = 500

export function appendBoundedEntries(
  prev: readonly ProviderDebugEntry[],
  entry: ProviderDebugEntry,
  capacity: number = PROVIDER_DEBUG_BUFFER_CAPACITY,
): ProviderDebugEntry[] {
  if (prev.length < capacity) {
    return prev.concat(entry)
  }
  return prev.slice(prev.length - capacity + 1).concat(entry)
}
