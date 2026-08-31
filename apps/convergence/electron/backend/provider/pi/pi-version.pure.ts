import { compareSemver } from '../provider-status.pure'

/**
 * `agent_settled` — the signal Convergence keys Pi session completion on —
 * shipped in pi 0.80.4 (earendil-works/pi#6363, "Added extension and RPC
 * `agent_settled` events plus session-level idle waiting"). Older pi never
 * emits it, so a session waiting for it would sit `running` forever.
 */
export const PI_AGENT_SETTLED_MIN_VERSION = '0.80.4'

export const PI_OUTDATED_COMPLETION_STATUS_LABEL = 'Update recommended'

export const PI_OUTDATED_COMPLETION_REASON =
  `Pi older than ${PI_AGENT_SETTLED_MIN_VERSION} cannot report when a run has fully settled, ` +
  'so Convergence marks sessions done as soon as the agent stops — before any ' +
  'retry or post-compaction continuation. Update pi for accurate completion states.'

/**
 * An unreadable version counts as too old on purpose: settling slightly early
 * is recoverable, a session stuck `running` forever is not.
 */
export function piSupportsAgentSettled(
  version: string | null | undefined,
): boolean {
  if (!version || !version.trim()) return false

  const comparison = compareSemver(version, PI_AGENT_SETTLED_MIN_VERSION)
  return comparison !== null && comparison >= 0
}
