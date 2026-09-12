/** Lifecycle facts, not transcript offsets or the session's last activity time. */
export interface SessionTurnTiming {
  turnId: string
  startedAt: string
  endedAt: string | null
  status: 'running' | 'completed' | 'errored'
}
