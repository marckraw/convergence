import { isRemoteExecutionHost } from '../execution-host-endpoint/execution-host-endpoint.pure'

/**
 * Codex's explicit "standard speed" tier id. The schema names it ("Use
 * \"default\" for standard speed", codex-cli 0.159.2), a throwaway
 * `thread/start {serviceTier:"default"}` answered `"default"` (measured
 * 2026-09-30), and the composer has sent it for new Off conversations since
 * July.
 */
export const CODEX_STANDARD_SERVICE_TIER = 'default'

/** What the Fast switch writes when it is on. Codex answers it as `priority`. */
export const CODEX_FAST_SERVICE_TIER = 'fast'

/**
 * Exactly the tiers the switch can show. A stored tier it cannot display --
 * `priority` would read as Off while the next turn ran Fast -- is the lie this
 * slice exists to end, so the door refuses it. CS2 (MAR-3574) widens this to
 * the tiers Codex's own model list offers, together with the picker that can
 * show them.
 */
const SERVICE_TIERS_THE_SWITCH_CAN_SHOW: ReadonlySet<string> = new Set([
  CODEX_STANDARD_SERVICE_TIER,
  CODEX_FAST_SERVICE_TIER,
])

export function parseServiceTierInput(value: unknown): string {
  const tier = typeof value === 'string' ? value.trim() : ''
  if (!SERVICE_TIERS_THE_SWITCH_CAN_SHOW.has(tier)) {
    throw new Error(`Unknown speed tier: ${String(value)}`)
  }
  return tier
}

/**
 * Why this session's speed tier cannot be changed from here, or null when it
 * can (MAR-3572 R4). The tier is a fact about the Codex CLI on this Mac: a
 * remote session runs on a daemon's installation and the tier has never
 * crossed the execution-host wire, and no other provider has one.
 */
export function describeServiceTierRefusal(session: {
  providerId: string
  executionHost?: string | null
}): string | null {
  if (session.providerId !== 'codex') {
    return 'Only Codex conversations have a speed setting.'
  }
  if (isRemoteExecutionHost(session.executionHost)) {
    return "A remote conversation's speed can't be changed from this app."
  }
  return null
}

/**
 * The tier a provider start carries (MAR-3572 R5).
 *
 * A local Codex session always states one. Omitting it makes Codex inherit the
 * account's catalog default, and ef.design's is `priority` (Fast): a session
 * whose switch reads Off would run Fast. A stored tier is sent as stored; a
 * session that never stored one (the pre-July rows) runs Standard, which is
 * what its Off switch says. Remote sessions and other providers stay null: the
 * tier is not theirs to carry.
 */
export function serviceTierForProviderStart(session: {
  providerId: string
  executionHost?: string | null
  serviceTier?: string | null
}): string | null {
  if (describeServiceTierRefusal(session) !== null) {
    return session.serviceTier ?? null
  }
  // `||`, not `??`: a blank stored tier would be dropped by the provider's
  // own truthiness check and inherit the account default all the same.
  return session.serviceTier?.trim() || CODEX_STANDARD_SERVICE_TIER
}
