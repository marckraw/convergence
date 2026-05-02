import {
  appendEntry,
  emptyRingState,
  serializeEntry,
} from './provider-debug.pure'
import type {
  ProviderDebugEntry,
  ProviderDebugRingState,
} from './provider-debug.types'
import type { ProviderDebugSink } from './provider-debug-sink'
import type { JsonlWriter } from './provider-debug-jsonl'

export const PROVIDER_DEBUG_CHANNEL = 'provider:debug:event'

export type BroadcastFn = (channel: string, payload: unknown) => void

export interface ProviderDebugServiceOptions {
  broadcast: BroadcastFn
  jsonl?: JsonlWriter
  isLoggingEnabled?: () => boolean
}

export class ProviderDebugService implements ProviderDebugSink {
  private readonly rings = new Map<string, ProviderDebugRingState>()
  private readonly broadcast: BroadcastFn
  private readonly jsonl: JsonlWriter | null
  private readonly isLoggingEnabled: () => boolean

  constructor(options: ProviderDebugServiceOptions) {
    this.broadcast = options.broadcast
    this.jsonl = options.jsonl ?? null
    this.isLoggingEnabled = options.isLoggingEnabled ?? (() => false)
  }

  record(entry: ProviderDebugEntry): void {
    const sessionId = entry.sessionId
    const existing = this.rings.get(sessionId) ?? emptyRingState()
    const next = appendEntry(existing, entry)
    this.rings.set(sessionId, next)
    this.broadcast(PROVIDER_DEBUG_CHANNEL, entry)
    if (this.jsonl && this.isLoggingEnabled()) {
      this.jsonl.writeLine(sessionId, serializeEntry(entry))
    }
  }

  list(sessionId: string): ProviderDebugEntry[] {
    return this.rings.get(sessionId)?.entries.slice() ?? []
  }

  drop(sessionId: string): void {
    this.rings.delete(sessionId)
  }
}
