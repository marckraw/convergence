/**
 * Providers the remote agents daemon can run. Mirrors the backend mapping in
 * electron/backend/provider/execution-host/remote-execution-host.pure.ts —
 * keep the two lists in sync.
 */
const REMOTE_CAPABLE_PROVIDER_IDS = new Set(['claude-code', 'codex', 'cursor'])

/**
 * Whether the composer should offer running the new session on the remote
 * execution host: a daemon must be configured, the session must belong to a
 * project (global sessions have no repository to materialize), and the
 * provider must have a daemon counterpart.
 */
export function isRemoteHostEligible(input: {
  remoteBaseUrl: string | null
  providerId: string
  contextKind: 'project' | 'global'
}): boolean {
  if (input.contextKind === 'global') return false
  if (!input.remoteBaseUrl) return false
  return REMOTE_CAPABLE_PROVIDER_IDS.has(input.providerId)
}
