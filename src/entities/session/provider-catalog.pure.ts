import {
  LOCAL_EXECUTION_HOST_ID,
  executionHostEndpointDisplayName,
  type ExecutionHostEndpoint,
} from '@/entities/execution-host'
import { namesThisMachine } from '@/shared/lib/execution-host-id.pure'
import { ownRecordValue } from '@/shared/lib/own-record.pure'
import { isConversationalProvider, type ProviderInfo } from './session.types'

/**
 * One provider on one machine, and whether that machine will run it
 * (MAR-2682). Mirrors `electron/backend/provider/provider-catalog.types.ts`.
 */
export interface ProviderCatalogEntry {
  descriptor: ProviderInfo
  /** Why this provider cannot be picked on this host, or null when it can. */
  blockedReason: string | null
}

/** Every provider one machine offers, carrying which machine that is. */
export interface ProviderCatalog {
  executionHostId: string
  providers: ProviderCatalogEntry[]
  unreachableReason: string | null
}

/**
 * Which machine a catalog is about, in every term the renderer can check
 * (MAR-2682).
 *
 * The id alone is not enough. An Endpoint id outlives the address behind it --
 * editing a base URL in Settings keeps the id and changes the machine -- so a
 * catalog keyed by id alone would keep answering for the daemon that id used to
 * name. This is the renderer's half of the guard the Remote Execution Host
 * already applies on the other side of the wire (`inForce`,
 * `daemonConfigurationFingerprint`).
 *
 * The daemon token is deliberately not in here, and not because it does not
 * matter: it matters, which is exactly why it stays in the main process. It
 * never crosses the preload boundary, so the renderer cannot fingerprint it and
 * must not try. A token change does not change *which machine* a catalog is
 * about, and the host on the far side already refuses a listing across one.
 */
export interface ProviderCatalogSource {
  /** `'local'`, or the Endpoint id. */
  executionHostId: string
  /** Everything the renderer knows about which machine that id names. */
  configuration: string
}

/**
 * An Endpoint id with no configured row behind it. A value of its own, and one
 * no base URL can produce, so it can never be mistaken for a real machine.
 */
const UNCONFIGURED_ENDPOINT_CONFIGURATION = '\u0000unconfigured'

/**
 * Joins the halves of a configuration.
 *
 * A character neither half can carry, so two different pairs cannot flatten to
 * one string. That is not a hope: an Endpoint id is `[A-Za-z0-9_-]{1,64}` by
 * `isExecutionHostEndpointId`, and a base URL has been through
 * `normalizeExecutionHostBaseUrl`, so neither can contain a NUL.
 */
const CONFIGURATION_SEPARATOR = '\u0000'

/** The one source that is not an Endpoint: this machine. */
export const LOCAL_PROVIDER_CATALOG_SOURCE: ProviderCatalogSource = {
  executionHostId: LOCAL_EXECUTION_HOST_ID,
  configuration: LOCAL_EXECUTION_HOST_ID,
}

/**
 * The catalog source for the machine the strip names, resolved against the
 * Endpoints as they stand right now.
 *
 * Resolved on every read rather than remembered, for the same reason the strip
 * itself is: the settings change that repoints an Endpoint and the render that
 * would have shown its old catalog are then the same beat.
 */
export function providerCatalogSourceForHost(
  executionHostId: string | null | undefined,
  endpoints: readonly ExecutionHostEndpoint[],
): ProviderCatalogSource {
  // Nothing named means this machine, exactly as every pre-Endpoint session
  // reads. A *value* is taken as it stands -- and which is which is asked of
  // `namesThisMachine`, the one predicate both doors call, rather than answered
  // again here. Answering it here is what went wrong twice: this door read
  // blank-or-whitespace as local while the main door (`ProviderCatalogService
  // .get`) refused whitespace by name, so the far refusal was unreachable from
  // the product and ` kuba ` reached it repaired into `kuba`. One rule at both
  // doors, or the far one is decoration (MAR-2682, S2's
  // `normalizeExecutionHostEndpoints`: "it used to be trimmed, which is a
  // quiet rewrite of the one value that must not be rewritten").
  const id = executionHostId ?? ''
  if (namesThisMachine(id)) {
    return LOCAL_PROVIDER_CATALOG_SOURCE
  }
  const endpoint = endpoints.find((candidate) => candidate.id === id)
  return {
    executionHostId: id,
    configuration: endpoint
      ? `${endpoint.id}${CONFIGURATION_SEPARATOR}${endpoint.baseUrl}`
      : UNCONFIGURED_ENDPOINT_CONFIGURATION,
  }
}

/**
 * A catalog and what is known about it, in every state it can be in
 * (MAR-2682).
 *
 * Each state carries the source it belongs to -- landed, pending and failed
 * alike. S1 spent a round on exactly this because the pending one did not: a
 * request in flight for one machine, joined by a caller asking about another,
 * reports ready about a daemon nobody asked (MAR-2620).
 */
export type ProviderCatalogState =
  | { status: 'pending'; source: ProviderCatalogSource }
  | {
      status: 'landed'
      source: ProviderCatalogSource
      providers: ProviderCatalogEntry[]
      unreachableReason: string | null
    }
  | { status: 'failed'; source: ProviderCatalogSource; reason: string }

export type ProviderCatalogs = Record<string, ProviderCatalogState>

/**
 * A catalog this store holds, handed back only while the configuration it was
 * read from is still the one that Endpoint points at (MAR-2682).
 *
 * The single read of the map, and the line that makes a stale pairing
 * unrepresentable rather than tidied up afterwards. Nothing has to notice that
 * a base URL changed; a catalog read from the old one simply cannot be obtained
 * here.
 */
export function providerCatalogInForce(
  catalogs: ProviderCatalogs,
  source: ProviderCatalogSource,
): ProviderCatalogState | null {
  const known = ownRecordValue(catalogs, source.executionHostId)
  return known && known.source.configuration === source.configuration
    ? known
    : null
}

/**
 * The providers a session can actually be started on. A blocked entry stays in
 * the catalog so the row can list it and say why, and is kept out of here so
 * nothing can resolve a selection onto it (MAR-2682).
 */
export function selectableProviderDescriptors(
  entries: readonly ProviderCatalogEntry[],
): ProviderInfo[] {
  return entries
    .filter((entry) => entry.blockedReason === null)
    .map((entry) => entry.descriptor)
}

/**
 * A catalog that arrived, checked against the machine it was asked of and then
 * narrowed to its conversational slice.
 *
 * The echoed `executionHostId` is read here or nowhere. Its own docblock on the
 * wire type calls it the load-bearing field -- "a list of providers is only
 * true of the machine it was read from" -- and a field nothing compares is a
 * comment, not a guard (MAR-2682). A reply that names another machine is
 * refused rather than trusted for this one: the renderer asked one question,
 * and an answer to a different one is not a late answer, it is a wrong one.
 *
 * Refused *as a failure* rather than dropped, because the row has to say
 * something. A silent drop would leave the source pending forever and the row
 * asking a machine that has already answered.
 *
 * Conversation surfaces (composer, session-start) only ever pick a real chat
 * provider; the synthetic shell provider is selected implicitly by the
 * terminal-session-create flow.
 */
export function landedProviderCatalog(
  source: ProviderCatalogSource,
  catalog: ProviderCatalog,
): ProviderCatalogState {
  if (catalog.executionHostId !== source.executionHostId) {
    return {
      status: 'failed',
      source,
      reason:
        `the reply describes "${catalog.executionHostId}", which is not the ` +
        'machine that was asked.',
    }
  }
  return {
    status: 'landed',
    source,
    providers: catalog.providers.filter((entry) =>
      isConversationalProvider(entry.descriptor),
    ),
    unreachableReason: catalog.unreachableReason,
  }
}

/**
 * A sentence the option row shows, and how bad the thing it reports is
 * (MAR-2682).
 *
 * `kind` is not a label for the sentence; it is what the row renders the
 * sentence *as*. A machine still being asked is a normal beat and reads muted;
 * a machine that could not be asked is a problem and reads as a warning. One
 * type for both notices the row can show, so the two can never come to look
 * alike by being styled in two places.
 */
export interface OptionRowNotice {
  kind: 'asking' | 'unreachable' | 'empty'
  text: string
}

/**
 * What the option row above the strip renders (MAR-2682).
 *
 * One value rather than a list plus a loose sentence, because "replace the
 * controls" and "stand beside them" are different renders and the difference
 * must not be re-derived from a count. It also decides whether the composer can
 * send: a row with no options cannot, a row showing an unconfirmed listing can.
 */
export type OptionRowCatalog =
  | {
      status: 'listed'
      entries: readonly ProviderCatalogEntry[]
      /** Non-null when what is listed is a listing the machine did not confirm. */
      notice: OptionRowNotice | null
    }
  | { status: 'notice'; notice: OptionRowNotice }

const NO_ENTRIES: readonly ProviderCatalogEntry[] = []

/** A machine that could not be asked, and has nothing standing from before. */
function unaskedNotice(hostLabel: string, reason: string): OptionRowNotice {
  return {
    kind: 'unreachable',
    text: `${hostLabel} could not be asked: ${reason}`,
  }
}

/**
 * A machine that could not be *re*-asked, said beside the listing that survived
 * (MAR-2682, "a dead daemon must not look alive").
 *
 * A different sentence from `unaskedNotice` because it is a different fact, and
 * the difference is the whole of what the reader needs: these options came from
 * that machine and are real, they are simply not confirmed right now. Saying
 * "could not be asked" over a row full of working controls would read as a
 * contradiction and get dismissed.
 */
function staleListingNotice(
  hostLabel: string,
  reason: string,
): OptionRowNotice {
  return {
    kind: 'unreachable',
    text:
      `${hostLabel} could not be re-asked: ${reason} These are the ` +
      'providers it last reported.',
  }
}

/**
 * The option row's own view of the catalog for the machine the strip names
 * (MAR-2619 S3).
 *
 * "Not yet known" and "local" are different states and must look different, so
 * a remote machine that has not answered gets a sentence naming it rather than
 * a row of controls filled from somewhere else. There is deliberately no such
 * state for this machine: the local registry is in this process, nobody waits
 * on it, and a first-frame notice above a Local session would be a change to
 * options that must not change at all (MAR-2682, "a Local row does not
 * change").
 *
 * A listing that survives a failed refresh is still shown -- a blip must not
 * empty a row that was correct a second ago -- and never silently. The daemon's
 * `unreachableReason` rides along with the options it could not confirm, so a
 * dead machine cannot look alive merely because an older answer is still in
 * hand. Reading the entries without it was this slice enforcing the
 * constitution everywhere but inside itself.
 */
export function resolveOptionRowCatalog(input: {
  source: ProviderCatalogSource
  hostLabel: string
  state: ProviderCatalogState | null
}): OptionRowCatalog {
  const state = input.state
  const landed = state?.status === 'landed' ? state : null

  // One derivation for every branch that lists something, so no branch can be
  // the one that forgets. Local goes through it too rather than hard-coding
  // null: this machine has no way to be un-askable today, and a branch that
  // asserted so would be the place the assertion quietly outlives the fact.
  const unconfirmed = landed?.unreachableReason
    ? staleListingNotice(input.hostLabel, landed.unreachableReason)
    : null

  // Exactly this machine, by the same rule the source was built under: a
  // source carries the id as it stands, and the only way `'local'` gets in
  // here is `providerCatalogSourceForHost` reading an absent one. Asking
  // `isLocalExecutionHost` would trim, and ` local ` -- an id no machine
  // has -- would take the branch that never waits and never explains, which
  // renders as an empty provider select: a door with nothing behind it
  // (MAR-2682).
  if (input.source.executionHostId === LOCAL_EXECUTION_HOST_ID) {
    return {
      status: 'listed',
      entries: landed ? landed.providers : NO_ENTRIES,
      notice: unconfirmed,
    }
  }

  if (!state || state.status === 'pending') {
    return {
      status: 'notice',
      notice: {
        kind: 'asking',
        text: `Asking ${input.hostLabel} which providers it runs…`,
      },
    }
  }

  if (state.status === 'failed') {
    return {
      status: 'notice',
      notice: unaskedNotice(input.hostLabel, state.reason),
    }
  }

  if (state.providers.length > 0) {
    return { status: 'listed', entries: state.providers, notice: unconfirmed }
  }

  // Nothing survived, so there is nothing to qualify: the daemon was not asked
  // at all, or it answered with nothing. The same empty list, two facts.
  return {
    status: 'notice',
    notice: state.unreachableReason
      ? unaskedNotice(input.hostLabel, state.unreachableReason)
      : {
          kind: 'empty',
          text: `${input.hostLabel} reports no providers it can run.`,
        },
  }
}

/**
 * What the option row calls the machine it is talking about. The same name the
 * strip shows, from the same derivation, so the notice and the strip beneath it
 * can never name the machine differently.
 */
export function providerCatalogHostLabel(
  executionHostId: string,
  endpoints: readonly ExecutionHostEndpoint[],
): string {
  const endpoint = endpoints.find(
    (candidate) => candidate.id === executionHostId,
  )
  return endpoint ? executionHostEndpointDisplayName(endpoint) : executionHostId
}

/**
 * A catalog as the main process serves it, for one machine (MAR-2682).
 *
 * The one constructor tests build catalogs with, and it takes the machine, so a
 * catalog can never be written down without saying which one it came from. A
 * fixture that could assert a nameless list would be a fixture unable to fail
 * the way the product does.
 */
export function providerCatalogOf(
  executionHostId: string,
  providers: readonly ProviderCatalogEntry[],
  unreachableReason: string | null = null,
): ProviderCatalog {
  return {
    executionHostId,
    providers: [...providers],
    unreachableReason,
  }
}

/** Plain descriptors as catalog entries: nothing a machine offers is blocked. */
export function offeredProviders(
  providers: readonly ProviderInfo[],
): ProviderCatalogEntry[] {
  return providers.map((descriptor) => ({ descriptor, blockedReason: null }))
}

/**
 * This machine's catalog, as the store holds it. Derived from the wire
 * constructor above rather than assembled beside it, so a fixture and the
 * product cannot disagree about what a landed local catalog looks like.
 */
export function localProviderCatalogs(
  providers: readonly ProviderInfo[],
): ProviderCatalogs {
  return {
    [LOCAL_EXECUTION_HOST_ID]: landedProviderCatalog(
      LOCAL_PROVIDER_CATALOG_SOURCE,
      providerCatalogOf(LOCAL_EXECUTION_HOST_ID, offeredProviders(providers)),
    ),
  }
}
