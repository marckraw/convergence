import type {
  ProviderDebugEntry,
  ProviderDebugRingState,
} from './provider-debug.types'

export const DEFAULT_RING_CAPACITY = 500
export const JSONL_ROTATE_BYTES = 10 * 1024 * 1024
export const JSONL_RETAIN_ROTATIONS = 5
export const JSONL_RETAIN_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function emptyRingState(
  capacity: number = DEFAULT_RING_CAPACITY,
): ProviderDebugRingState {
  return { capacity, entries: [] }
}

export function appendEntry(
  state: ProviderDebugRingState,
  entry: ProviderDebugEntry,
): ProviderDebugRingState {
  const next = state.entries.concat(entry)
  if (next.length <= state.capacity) {
    return { capacity: state.capacity, entries: next }
  }
  return {
    capacity: state.capacity,
    entries: next.slice(next.length - state.capacity),
  }
}

export function serializeEntry(entry: ProviderDebugEntry): string {
  try {
    return JSON.stringify(entry)
  } catch {
    const safe: ProviderDebugEntry = {
      ...entry,
      payload: '<unserializable>',
    }
    return JSON.stringify(safe)
  }
}
