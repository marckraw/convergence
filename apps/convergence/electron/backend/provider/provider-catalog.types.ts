import type { ProviderDescriptor } from './provider.types'

/**
 * One provider on one machine, and whether that machine will run it
 * (MAR-2682).
 *
 * The descriptor says what the provider is; `blockedReason` says whether this
 * host will take a session on it. They are one value because they are one
 * answer to one question -- "what can I pick here?" -- and splitting them let
 * the option row list a provider the host had already refused.
 *
 * A reason rather than a flag, and listed rather than dropped: S2's precedent,
 * because a disabled row teaches what the machine cannot do while an absent one
 * is a mystery.
 */
export interface ProviderCatalogEntry {
  descriptor: ProviderDescriptor
  /** Why this provider cannot be picked on this host, or null when it can. */
  blockedReason: string | null
}

/**
 * Every provider one machine offers, carrying which machine that is
 * (MAR-2682).
 *
 * The `executionHostId` is not decoration and not a convenience for logging:
 * it is what makes a cached catalog refusable. A list of providers is only
 * true of the machine it was read from, and a catalog that did not say which
 * machine that was is one the renderer could hand to a session bound for
 * another -- the lie this era exists to stop (MAR-2619).
 *
 * `unreachableReason` is the third state, and it is here because the other two
 * cannot express it: an empty listing from a daemon that answered and an empty
 * listing from a daemon that never did are the same shape and different facts.
 */
export interface ProviderCatalog {
  /** `'local'`, or the Endpoint id this catalog was read from. */
  executionHostId: string
  providers: ProviderCatalogEntry[]
  /** Why this machine could not be asked, or null when it answered. */
  unreachableReason: string | null
}
