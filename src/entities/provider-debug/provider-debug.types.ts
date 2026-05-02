// Mirror of electron/backend/provider-debug/provider-debug.types.ts.
// Renderer tsconfig cannot import from electron/; keep shapes in sync.

export type ProviderDebugChannel =
  | 'notification'
  | 'response'
  | 'request'
  | 'event'
  | 'stdout'
  | 'stderr'
  | 'lifecycle'

export interface ProviderDebugEntry {
  sessionId: string
  providerId: string
  at: number
  direction: 'in' | 'out'
  channel: ProviderDebugChannel
  method?: string
  payload?: unknown
  bytes?: number
  note?: string
}
