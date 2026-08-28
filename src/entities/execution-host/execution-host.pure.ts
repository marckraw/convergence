import { LOCAL_EXECUTION_HOST_ID } from '@/shared/lib/execution-host-id.pure'
import type { ExecutionHostEndpoint } from './execution-host.types'

/**
 * The one execution host that is not an Endpoint: this machine (MAR-2620).
 *
 * Re-exported from the shared module rather than declared here, because the
 * predicate that reads it is called by the main process too and had to live
 * where both sides can import it (MAR-2682). Renderer code keeps importing it
 * from this entity, which is where the rest of the vocabulary lives.
 */
export { LOCAL_EXECUTION_HOST_ID }

/**
 * The id the Endpoint born from the single-host era carries (MAR-2620).
 *
 * Not "the one Settings edits" any more: since MAR-2642 the settings surface
 * holds a list, and this is one row in it — the only one whose id predates
 * plurality. It still has to be named, because an Endpoint's Keychain account
 * is its id, and the daemon token stored before Endpoints were plural is filed
 * under this one.
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

/** What an Endpoint calls itself before it has been named. */
export const UNNAMED_EXECUTION_HOST_ENDPOINT_LABEL = 'Unnamed endpoint'

/**
 * How an Endpoint refers to itself in buttons, warnings, strips and labels.
 *
 * Lives with the entity rather than with either surface that renders it: the
 * settings panel and the Execution Bar both name the same machines, and a
 * second copy of this rule would let one of them call an unnamed Endpoint
 * something the other does not — the strip promising a machine Settings has no
 * row for (MAR-2642).
 */
export function executionHostEndpointDisplayName(
  endpoint: Pick<ExecutionHostEndpoint, 'label'>,
): string {
  return endpoint.label.trim() || UNNAMED_EXECUTION_HOST_ENDPOINT_LABEL
}
