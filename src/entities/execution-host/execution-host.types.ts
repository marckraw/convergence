/**
 * One machine a session can run on, other than this one (MAR-2620).
 *
 * Mirrors `electron/backend/execution-host-endpoint/execution-host-endpoint.types.ts`
 * across the preload boundary — keep the two in sync.
 */
export interface ExecutionHostEndpoint {
  id: string
  label: string
  baseUrl: string
  position: number
  createdAt: string
  updatedAt: string
}

/** An endpoint as the settings form supplies it. */
export interface ExecutionHostEndpointInput {
  id?: string
  label?: string
  baseUrl: string
}
