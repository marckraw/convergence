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

export interface ProviderDebugRingState {
  capacity: number
  entries: ProviderDebugEntry[]
}
