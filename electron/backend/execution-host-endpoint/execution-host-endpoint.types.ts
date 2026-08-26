/**
 * One machine a session can run on, other than this one (MAR-2620).
 *
 * Until now Convergence knew a single remote daemon and recorded the fact as
 * the string `'remote'`. One daemon made that survivable; two make it a lie,
 * because a session that says `'remote'` cannot say *which* remote. An Endpoint
 * gives that answer an identity, and `sessions.execution_host` stores it.
 */
export interface ExecutionHostEndpoint {
  /**
   * Stable identity. This is what a session records and what the Keychain
   * account for this endpoint's token is named, so it must never be reissued
   * for a different machine.
   */
  id: string
  label: string
  /** Normalized HTTP(S) origin, no trailing slash. */
  baseUrl: string
  /** Order in the list the Execution Bar will draw, Local excluded. */
  position: number
  createdAt: string
  updatedAt: string
}

/** An Endpoint as the settings surface supplies it: identity plus the facts. */
export interface ExecutionHostEndpointInput {
  id?: string
  label?: string
  baseUrl: string
}
