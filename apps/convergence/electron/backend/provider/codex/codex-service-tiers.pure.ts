/**
 * Codex's speed tiers, as one account's `model/list` states them (MAR-3574).
 *
 * Each model record carries `serviceTiers: [{ id, name, description }]` and a
 * `defaultServiceTier` (codex-cli 0.159.2). Which tiers appear is a fact about
 * the account — Ultrafast only for Pro $500 or eligible Enterprise — so this
 * is read per account, never from the ambient descriptor.
 */
export interface CodexServiceTierOption {
  id: string
  name: string
  description: string
}

export interface CodexModelServiceTiers {
  tiers: CodexServiceTierOption[]
  defaultTier: string | null
}

export type CodexServiceTiersByModel = Record<string, CodexModelServiceTiers>

export type CodexServiceTiersSnapshot =
  | {
      status: 'available'
      models: CodexServiceTiersByModel
      checkedAt: string
    }
  | { status: 'warming-up'; checkedAt: string }
  | { status: 'unavailable'; reason: string; checkedAt: string }

/** Codex's own id for standard speed. Never a tier in the list. */
export const CODEX_STANDARD_TIER_ID = 'default'

/** The legacy id the Fast switch wrote. Codex answers it as `priority`. */
export const CODEX_LEGACY_FAST_TIER_ID = 'fast'
export const CODEX_PRIORITY_TIER_ID = 'priority'

function readTier(value: unknown): CodexServiceTierOption | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!id || !name || id === CODEX_STANDARD_TIER_ID) return null
  return {
    id,
    name,
    description:
      typeof record.description === 'string' ? record.description.trim() : '',
  }
}

/**
 * Maps `model/list`'s `data` to tiers per model id. A hidden model and a
 * record without a model id are skipped; a model with no tiers is kept with
 * an empty list, because "offers none" is an answer.
 */
export function mapCodexServiceTiers(data: unknown): CodexServiceTiersByModel {
  const models: CodexServiceTiersByModel = {}
  if (!Array.isArray(data)) return models
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (record.hidden === true) continue
    const modelId =
      typeof record.model === 'string'
        ? record.model
        : typeof record.id === 'string'
          ? record.id
          : ''
    if (!modelId) continue
    const tiers = Array.isArray(record.serviceTiers)
      ? record.serviceTiers
          .map(readTier)
          .filter((tier): tier is CodexServiceTierOption => tier !== null)
      : []
    const defaultTier =
      typeof record.defaultServiceTier === 'string' &&
      record.defaultServiceTier.trim()
        ? record.defaultServiceTier.trim()
        : null
    models[modelId] = { tiers, defaultTier }
  }
  return models
}

/** A stored tier as Codex means it: the legacy `fast` is `priority`. */
export function canonicalCodexTierId(tierId: string): string {
  return tierId === CODEX_LEGACY_FAST_TIER_ID ? CODEX_PRIORITY_TIER_ID : tierId
}

/**
 * Whether a model offers a tier on the account this snapshot is about.
 * Standard is always offered; nothing else is offered by an unread list.
 */
export function isCodexTierOffered(
  snapshot: CodexServiceTiersSnapshot,
  modelId: string | null,
  tierId: string,
): boolean {
  if (tierId === CODEX_STANDARD_TIER_ID) return true
  if (snapshot.status !== 'available' || !modelId) return false
  const wanted = canonicalCodexTierId(tierId)
  return (snapshot.models[modelId]?.tiers ?? []).some(
    (tier) => tier.id === wanted,
  )
}
