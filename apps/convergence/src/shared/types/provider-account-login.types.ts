/** Ephemeral login state. URLs contain OAuth state and must never be persisted. */
export interface ProviderAccountLoginAttempt {
  id: string
  providerId: 'claude-code' | 'codex'
  accountId: string | null
  kind: 'enrol' | 'reconnect'
  state:
    | 'preparing'
    | 'waiting-browser'
    | 'waiting-code'
    | 'finishing'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timed-out'
  active: boolean
  authorizationUrl: string | null
  message: string
  startedAt: string
}
