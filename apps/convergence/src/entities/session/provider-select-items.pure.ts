import {
  getProviderLifecycleBadge,
  type ProviderLifecycleBadge,
  type ResolvedProviderSelection,
} from './provider-selection.pure'
import type { ProviderInfo, ReasoningEffort } from './session.types'

/** A provider as a picker lists it (CONV-17), before its mark is drawn. */
export interface ProviderSelectItem {
  id: string
  /** What the choice says: the vendor ("Anthropic"), else the provider's name. */
  label: string
  /**
   * The line under it: why this machine won't run it, else the provider's own
   * name when the vendor label stands in for it.
   */
  description?: string
  /** ALPHA where support is early, with what that means. */
  badge?: ProviderLifecycleBadge
  /** Listed and disabled, never dropped, when the machine won't run it. */
  disabled: boolean
  /** What its mark (ProviderIcon) is drawn from. */
  vendorLabel: string
  name: string
}

/** An effort as a picker lists it: its id, its words and what it means. */
export interface EffortSelectItem {
  id: ReasoningEffort
  label: string
  description?: string
}

/**
 * The providers a picker offers (CONV-17): the composer's toolbar and the
 * fork dialog list them from this one mapping, so a provider reads the same in
 * both. A provider the machine won't run is listed and disabled with its
 * reason, never dropped (MAR-2682).
 */
export function providerSelectItems(
  entries: ReadonlyArray<{
    descriptor: ProviderInfo
    /** Why this machine won't run it; absent or null when it will. */
    blockedReason?: string | null
  }>,
): ProviderSelectItem[] {
  return entries.map(({ descriptor, blockedReason = null }) => ({
    id: descriptor.id,
    label: descriptor.vendorLabel || descriptor.name,
    description:
      blockedReason ??
      (descriptor.vendorLabel && descriptor.vendorLabel !== descriptor.name
        ? descriptor.name
        : undefined),
    badge: getProviderLifecycleBadge(descriptor) ?? undefined,
    disabled: blockedReason !== null,
    vendorLabel: descriptor.vendorLabel,
    name: descriptor.name,
  }))
}

/**
 * The efforts a picker offers for the selection's model (CONV-17).
 *
 * A stranded session has no catalog model to read options from, but its row
 * still carries an effort: that one is listed alone, so the control shows
 * what the row says instead of vanishing (MAR-2550).
 */
export function effortSelectItems(
  selection: Pick<ResolvedProviderSelection, 'model' | 'effort'>,
): EffortSelectItem[] {
  return (
    selection.model?.effortOptions ??
    (selection.effort ? [selection.effort] : [])
  ).map((effort) => ({
    id: effort.id,
    label: effort.label,
    description: effort.description,
  }))
}
