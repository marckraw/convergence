/**
 * The one execution host that is not an Endpoint: this machine (MAR-2620).
 *
 * Mirrors the backend constant of the same name. Every other value a session's
 * `executionHost` can hold is an Endpoint id, so `'local'` is the only literal
 * the renderer may compare against — the string `'remote'` named a single
 * daemon back when there could only be one, and cannot name which of several.
 */
export const LOCAL_EXECUTION_HOST_ID = 'local'

/**
 * The id the Endpoint born from the single-host era carries. The settings form
 * still edits exactly one daemon, and this is the one it edits.
 */
export const DEFAULT_EXECUTION_HOST_ENDPOINT_ID = 'default'

/** Runs inside the app process. */
export function isLocalExecutionHost(
  executionHostId: string | null | undefined,
): boolean {
  const trimmed =
    typeof executionHostId === 'string' ? executionHostId.trim() : ''
  return (trimmed || LOCAL_EXECUTION_HOST_ID) === LOCAL_EXECUTION_HOST_ID
}

/** Runs on some Endpoint — which one is the id itself, never a boolean. */
export function isRemoteExecutionHost(
  executionHostId: string | null | undefined,
): boolean {
  return !isLocalExecutionHost(executionHostId)
}
