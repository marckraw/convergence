import {
  appendEntry,
  boundEntryPayload,
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
  maxSessionRings?: number
}

const DEFAULT_MAX_SESSION_RINGS = 10

export class ProviderDebugService implements ProviderDebugSink {
  private readonly rings = new Map<string, ProviderDebugRingState>()
  private readonly broadcast: BroadcastFn
  private readonly jsonl: JsonlWriter | null
  private readonly isLoggingEnabled: () => boolean
  private readonly maxSessionRings: number

  constructor(options: ProviderDebugServiceOptions) {
    this.broadcast = options.broadcast
    this.jsonl = options.jsonl ?? null
    this.isLoggingEnabled = options.isLoggingEnabled ?? (() => false)
    this.maxSessionRings = Math.max(
      1,
      options.maxSessionRings ?? DEFAULT_MAX_SESSION_RINGS,
    )
  }

  record(entry: ProviderDebugEntry): void {
    const boundedEntry = boundEntryPayload(entry)
    const sessionId = boundedEntry.sessionId
    const existing = this.rings.get(sessionId) ?? emptyRingState()
    const next = appendEntry(existing, boundedEntry)
    if (this.rings.has(sessionId)) {
      this.rings.delete(sessionId)
    } else if (this.rings.size >= this.maxSessionRings) {
      const oldestSessionId = this.rings.keys().next().value as
        | string
        | undefined
      if (oldestSessionId) this.rings.delete(oldestSessionId)
    }
    this.rings.set(sessionId, next)
    this.broadcast(PROVIDER_DEBUG_CHANNEL, boundedEntry)
    if (this.jsonl && this.isLoggingEnabled()) {
      this.jsonl.writeLine(sessionId, serializeEntry(boundedEntry))
    }
  }

  list(sessionId: string): ProviderDebugEntry[] {
    return this.rings.get(sessionId)?.entries.slice() ?? []
  }

  drop(sessionId: string): void {
    this.rings.delete(sessionId)
  }
}
