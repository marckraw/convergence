import {
  appendEntry,
  emptyRingState,
} from './provider-debug.pure'
import type {
  ProviderDebugEntry,
  ProviderDebugRingState,
} from './provider-debug.types'
import type { ProviderDebugSink } from './provider-debug-sink'

export const PROVIDER_DEBUG_CHANNEL = 'provider:debug:event'

export type BroadcastFn = (channel: string, payload: unknown) => void

export class ProviderDebugService implements ProviderDebugSink {
  private readonly rings = new Map<string, ProviderDebugRingState>()
  private readonly broadcast: BroadcastFn

  constructor(broadcast: BroadcastFn) {
    this.broadcast = broadcast
  }

  record(entry: ProviderDebugEntry): void {
    const sessionId = entry.sessionId
    const existing = this.rings.get(sessionId) ?? emptyRingState()
    const next = appendEntry(existing, entry)
    this.rings.set(sessionId, next)
    this.broadcast(PROVIDER_DEBUG_CHANNEL, entry)
  }

  list(sessionId: string): ProviderDebugEntry[] {
    return this.rings.get(sessionId)?.entries.slice() ?? []
  }

  drop(sessionId: string): void {
    this.rings.delete(sessionId)
  }
}
