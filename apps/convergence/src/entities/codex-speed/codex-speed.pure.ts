import type { CodexSpeedSnapshot } from '@/shared/types/codex-speed.types'

/** Codex's own id for standard speed (MAR-3572). */
export const CODEX_STANDARD_SPEED_ID = 'default'

/** One row of the speed choice. */
export interface CodexSpeedChoice {
  id: string
  label: string
  description: string | null
}

/** A stored tier as Codex means it: the Fast switch's legacy `fast` is `priority`. */
export function canonicalCodexSpeedId(id: string | null | undefined): string {
  const trimmed = id?.trim() || CODEX_STANDARD_SPEED_ID
  return trimmed === 'fast' ? 'priority' : trimmed
}

/** Whether the account behind `snapshot` is offered `id` for `modelId`. */
export function isCodexSpeedOffered(
  snapshot: CodexSpeedSnapshot | null,
  modelId: string | null,
  id: string,
): boolean {
  const wanted = canonicalCodexSpeedId(id)
  if (wanted === CODEX_STANDARD_SPEED_ID) return true
  if (snapshot?.status !== 'available' || !modelId) return false
  return (snapshot.models[modelId]?.tiers ?? []).some(
    (tier) => tier.id === wanted,
  )
}

/**
 * A name for a tier while the account's list is unread: Codex's own names for
 * the ids it has served (`priority` has always been called Fast), else the id.
 * Only ever used for the tier already chosen -- it labels, it never offers.
 */
const KNOWN_TIER_NAMES: Readonly<Record<string, string>> = {
  priority: 'Fast',
  ultrafast: 'Ultrafast',
}

function labelFromId(id: string): string {
  return KNOWN_TIER_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

/**
 * What the speed choice lists (MAR-3574 R2): Standard, then exactly the tiers
 * Codex offers this model on this account, in Codex's order and under Codex's
 * names. Nothing is hard-coded. While the account's list is unknown, the only
 * other row is the tier already chosen — shown so the choice never claims a
 * speed it is not running, and offered nothing new.
 */
export function codexSpeedChoices(input: {
  snapshot: CodexSpeedSnapshot | null
  modelId: string | null
  selectedId: string
}): CodexSpeedChoice[] {
  const standard: CodexSpeedChoice = {
    id: CODEX_STANDARD_SPEED_ID,
    label: 'Standard',
    description: null,
  }
  const selected = canonicalCodexSpeedId(input.selectedId)
  if (input.snapshot?.status === 'available' && input.modelId) {
    const offered = (input.snapshot.models[input.modelId]?.tiers ?? []).map(
      (tier) => ({
        id: tier.id,
        label: tier.name,
        description: tier.description || null,
      }),
    )
    // A chosen tier the list does not offer stays visible and says so, so the
    // label never claims Standard over a row that still holds another speed.
    const keepsChosen =
      selected === CODEX_STANDARD_SPEED_ID ||
      offered.some((choice) => choice.id === selected)
    return keepsChosen
      ? [standard, ...offered]
      : [
          standard,
          ...offered,
          {
            id: selected,
            label: `${labelFromId(selected)} (not offered)`,
            description: null,
          },
        ]
  }
  return selected === CODEX_STANDARD_SPEED_ID
    ? [standard]
    : [
        standard,
        { id: selected, label: labelFromId(selected), description: null },
      ]
}

/**
 * The tier a choice must fall back to after the model or account changed
 * (MAR-3574 R4): Standard when the account's list is known and no longer
 * offers it; unchanged while the list is unknown, because an unread list is
 * not a refusal.
 */
export function codexSpeedAfterChange(input: {
  snapshot: CodexSpeedSnapshot | null
  modelId: string | null
  currentId: string
}): string {
  const current = canonicalCodexSpeedId(input.currentId)
  if (current === CODEX_STANDARD_SPEED_ID) return current
  if (input.snapshot?.status !== 'available') return current
  return isCodexSpeedOffered(input.snapshot, input.modelId, current)
    ? current
    : CODEX_STANDARD_SPEED_ID
}
