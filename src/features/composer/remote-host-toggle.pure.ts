import type { ExecutionHostEndpoint } from '@/entities/execution-host'

/**
 * Providers the remote agents daemon can run. Mirrors the backend mapping in
 * electron/backend/provider/execution-host/remote-execution-host.pure.ts —
 * keep the two lists in sync.
 */
const REMOTE_CAPABLE_PROVIDER_IDS = new Set(['claude-code', 'codex', 'cursor'])

/**
 * Whether the composer should offer running the new session on a remote
 * execution host: an Endpoint must be configured, the session must belong to a
 * project (global sessions have no repository to materialize), and the
 * provider must have a daemon counterpart.
 */
export function isRemoteHostEligible(input: {
  endpoints: readonly ExecutionHostEndpoint[]
  providerId: string
  contextKind: 'project' | 'global'
}): boolean {
  if (input.contextKind === 'global') return false
  if (!input.endpoints.length) return false
  return REMOTE_CAPABLE_PROVIDER_IDS.has(input.providerId)
}

/**
 * The Endpoint the toggle sends a session to (MAR-2620).
 *
 * The toggle is still a yes/no while the Execution Bar does not exist, so it
 * means the first Endpoint — the one the settings form edits. It returns the
 * id rather than a boolean because a session must record *which* machine it
 * ran on; `'remote'` could not say that, which is why it is gone.
 */
export function toggledExecutionHostId(
  endpoints: readonly ExecutionHostEndpoint[],
): string | null {
  return endpoints[0]?.id ?? null
}
