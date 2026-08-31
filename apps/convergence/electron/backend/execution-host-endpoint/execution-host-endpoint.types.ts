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

/**
 * An Endpoint as App Settings hands it out: the stored row, plus the epoch of
 * the configuration in force for it (MAR-2689 round 6).
 *
 * Two types rather than one field on the row, because the epoch is not stored
 * and never will be: it counts what has been *observed* about a machine, which
 * is a fact of this launch and of the credential store, not of the database.
 * `ExecutionHostEndpointRepository` therefore cannot produce it and is not
 * asked to; `AppSettingsService` splices it on at the one door every reader of
 * the Endpoint list already goes through.
 *
 * Read-only downstream, and structurally so: `ExecutionHostEndpointInput` has
 * no such field and `normalizeExecutionHostEndpoints` names the four it
 * writes, so a renderer that hands the value back is handing back something
 * the write path cannot see.
 */
export interface ConfiguredExecutionHostEndpoint extends ExecutionHostEndpoint {
  /**
   * Bumped whenever this Endpoint's base URL or token stops being the one it
   * was last resolved under. An integer, deliberately: the renderer needs to
   * know that the configuration changed and must not be able to learn what it
   * changed to (`ExecutionHostConfigurationEpochs`).
   */
  configurationEpoch: number
}

/**
 * An Endpoint as the settings surface supplies it: identity plus the facts.
 *
 * `id` is required, and required for the same reason it must never be
 * reissued. An optional id has to be filled in by whoever receives it, and the
 * only value that could be filled in is one that already means a specific
 * machine — so an id-less Endpoint is an Endpoint that inherits another one's
 * identity, its sessions and its Keychain account (MAR-2642).
 */
export interface ExecutionHostEndpointInput {
  id: string
  label?: string
  baseUrl: string
}
