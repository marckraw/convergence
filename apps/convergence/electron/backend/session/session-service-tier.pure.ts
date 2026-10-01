import { isRemoteExecutionHost } from '../execution-host-endpoint/execution-host-endpoint.pure'

/**
 * Codex's explicit "standard speed" tier id. The schema names it ("Use
 * \"default\" for standard speed", codex-cli 0.159.2), a throwaway
 * `thread/start {serviceTier:"default"}` answered `"default"` (measured
 * 2026-09-30), and the composer has sent it for new Off conversations since
 * July.
 */
export const CODEX_STANDARD_SERVICE_TIER = 'default'

/**
 * A tier id as Codex spells them (`default`, `priority`, `ultrafast`, and the
 * legacy `fast`): one lowercase token. Only the shape is checked here. Whether
 * the account offers the tier is the app layer's question (MAR-3574 R3),
 * because Codex drops a tier it does not offer without an error.
 */
const SERVICE_TIER_ID = /^[a-z][a-z0-9_-]{0,31}$/

export function parseServiceTierInput(value: unknown): string {
  const tier = typeof value === 'string' ? value.trim() : ''
  if (!SERVICE_TIER_ID.test(tier)) {
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
