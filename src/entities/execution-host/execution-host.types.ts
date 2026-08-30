/**
 * One machine a session can run on, other than this one (MAR-2620).
 *
 * Mirrors `ConfiguredExecutionHostEndpoint` in
 * `electron/backend/execution-host-endpoint/execution-host-endpoint.types.ts`
 * across the preload boundary — keep the two in sync.
 */
export interface ExecutionHostEndpoint {
  id: string
  label: string
  baseUrl: string
  position: number
  createdAt: string
  updatedAt: string
  /**
   * How many times the main process has seen this Endpoint's base URL or token
   * stop being the one it was last resolved under (MAR-2689 round 6).
   *
   * The renderer's half of the daemon configuration it is not allowed to see.
   * A token never crosses this boundary and must not, so a rotation used to be
   * invisible here: a catalog read under the old credential stayed in force,
   * because the only thing that had changed was the one thing the renderer
   * could not compare. An integer says "not the configuration you asked
   * under" and says nothing else — not the token, not its shape, not whether
   * one exists.
   *
   * Computed in main and never sent back: `ExecutionHostEndpointInput` has no
   * such field, so the settings save cannot carry it even by accident.
   */
  configurationEpoch: number
}

/**
 * An endpoint as the settings form supplies it. `id` is required: an Endpoint
 * with no identity of its own can only inherit one, and an inherited id is
 * another machine's sessions and another machine's token (MAR-2642).
 */
export interface ExecutionHostEndpointInput {
  id: string
  label?: string
  baseUrl: string
}
