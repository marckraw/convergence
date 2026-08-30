import type { ProviderDescriptor } from '../provider.types'
import type { EndpointHandshakeResult } from './execution-host-handshake.types'
import type { ProviderCatalogEntry } from '../provider-catalog.types'
import type {
  ExecutionHostProviderCapabilities,
  RemoteSessionWorkspaceInfo,
} from './execution-host.types'
import {
  RemoteExecutionHostError,
  type RemoteExecutionHostConnection,
  type RemoteExecutionHostProviderInfo,
} from './remote-execution-host.types'

/**
 * The configuration of an Endpoint whose base URL or token could not be
 * resolved at all. A value of its own rather than the empty string, and one no
 * URL can contain, so it can never be mistaken for a real machine's
 * configuration.
 */
export const UNRESOLVED_DAEMON_CONFIGURATION = '\u0000unresolved'

/**
 * The identity of the daemon configuration a listing was read from (MAR-2620).
 *
 * Everything a listing depends on goes in. A provider list read from one
 * address is not true of another, and one read with a token the daemon has
 * since stopped honouring is not true of that daemon either -- so two
 * configurations are the same one only when both halves match. Anything left
 * out here is a way for an answer to outlive the machine it describes.
 *
 * A NUL join is safe *here* and nowhere else in this file (MAR-2689 round 10),
 * and it is safe on a one-sided rule: only the FIRST component of a NUL join
 * has to be NUL-free, because the first NUL in the result is then always the
 * separator and every byte after it belongs to the second component. The base
 * URL is that first component and it earns the rule by normalisation --
 * `normalizeExecutionHostBaseUrl` returns `new URL(...).href`, and the WHATWG
 * parser percent-encodes a NUL in the path, query or fragment and refuses a
 * host that carries one -- so a stored base URL is NUL-free and non-empty.
 * That alone makes the fingerprint injective, and it keeps
 * `UNRESOLVED_DAEMON_CONFIGURATION` out of reach: a real fingerprint starts
 * with a non-empty base URL, so it never begins with a NUL.
 *
 * The token's bytes are not constrained here and must not be: past the trim
 * and the empty-value refusal at `setToken`, a daemon may issue whatever bytes
 * it likes, and MAR-2642 stores the token as hex precisely so that whatever it
 * contains -- control characters and NUL included -- stays storable and is
 * never inspected. The argument above needs no NUL-free guarantee from the
 * token at all. The capability set below is a list whose elements have no such
 * guarantee on either side, which is why it is encoded instead of joined.
 */
export function daemonConfigurationFingerprint(
  connection: RemoteExecutionHostConnection | null,
): string {
  if (!connection) return UNRESOLVED_DAEMON_CONFIGURATION
  return `${connection.baseUrl}\u0000${connection.token}`
}

/**
 * The capability set of a daemon that never answered its handshake, so that a
 * machine that has gone quiet can never be mistaken for one that answered and
 * offers nothing.
 *
 * JSON's encoding of "no answer", and not a capability-shaped string, because
 * no advertised set can produce it: a set is encoded as an array and an array's
 * encoding begins with `[`. The round-8 sentinel was `'\u0000unknown'`, which
 * is exactly what a machine advertising the single capability id
 * `\u0000unknown` fingerprinted to -- and the protocol accepts any non-empty
 * string as an id, so that machine is one a daemon could actually be
 * (MAR-2689 round 9).
 */
export const UNKNOWN_DAEMON_CAPABILITIES = JSON.stringify(null)

/**
 * What a machine says it can do, as one comparable value (MAR-2689 round 8).
 *
 * The sibling of `daemonConfigurationFingerprint`, and the second input to an
 * Endpoint's configuration epoch. Identity is not the only thing an answer
 * derived from a daemon depends on: a machine upgraded at the same address and
 * under the same credential can stop advertising `projects.v1`, and a listing
 * read while it did is not true of the machine that is there now. The
 * configuration fingerprint cannot see that -- neither half of it moved -- so
 * this is the half that can.
 *
 * A *set*, not a list: the order a daemon serialises its capabilities in says
 * nothing about what it can do, and counting a reordering as a change would put
 * every catalog on that machine out of force for nothing. Order is handled by
 * the sort here; duplicates cannot arrive at all, because the protocol decoder
 * hands back `[...new Set(raw.capabilities)]`.
 *
 * Encoded, never joined (MAR-2689 round 9). A capability id is an external
 * string the protocol constrains only to being non-empty, so joining the sorted
 * ids on a separator is joining them on a character an id may contain:
 * `['projects.v1', 'x']` and `['projects.v1\u0000x']` would be one value while
 * meaning opposite things, and a crafted `/health` could cross the line
 * `remoteProjectsCapability` draws without moving this Endpoint's epoch --
 * leaving the strip offering a place the start door had already begun refusing.
 * `JSON.stringify` of the sorted array escapes what a separator cannot, so
 * different sets are different values.
 *
 * Nothing here is secret -- `/health` is unauthenticated -- but the value never
 * leaves the main process either: what crosses to the renderer is the integer
 * the epoch ledger counts from it.
 */
export function daemonCapabilitiesFingerprint(
  handshake: EndpointHandshakeResult | null,
): string {
  if (!handshake) return UNKNOWN_DAEMON_CAPABILITIES
  return JSON.stringify([...handshake.executionProtocolCapabilities].sort())
}

/**
 * Parses the daemon /v0/meta response into the provider slice the Remote
 * Execution Host consumes. Throws RemoteExecutionHostError('malformed') when
 * the response does not carry a well-formed provider listing.
 */
export function parseRemoteExecutionHostMeta(
  value: unknown,
): RemoteExecutionHostProviderInfo[] {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    throw new RemoteExecutionHostError(
      'Remote daemon meta response is missing a provider listing.',
      'malformed',
    )
  }

  return value.providers.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.label !== 'string' ||
      typeof entry.available !== 'boolean' ||
      typeof entry.authenticated !== 'boolean'
    ) {
      throw new RemoteExecutionHostError(
        'Remote daemon meta response carries a malformed provider entry.',
        'malformed',
      )
    }

    const features = isRecord(entry.features) ? entry.features : {}
    const models = Array.isArray(entry.models) ? entry.models : []

    return {
      providerId: entry.id,
      name: entry.label,
      available: entry.available,
      authenticated: entry.authenticated,
      details: typeof entry.details === 'string' ? entry.details : null,
      supportsContinuation: features.resume === true,
      models: models.flatMap((model) => {
        if (!isRecord(model) || typeof model.slug !== 'string') return []
        return [
          {
            id: model.slug,
            label: typeof model.label === 'string' ? model.label : model.slug,
          },
        ]
      }),
    }
  })
}

/**
 * Capability summary for one remote provider. One-shot execution has no wire
 * endpoint yet, so remote providers never advertise it.
 */
export function capabilitiesForRemoteProvider(
  info: RemoteExecutionHostProviderInfo,
): ExecutionHostProviderCapabilities {
  return {
    providerId: info.providerId,
    name: info.name,
    supportsContinuation: info.supportsContinuation,
    supportsOneShot: false,
    supportsContextManagement: false,
  }
}

/**
 * Synthesizes a ProviderDescriptor from the daemon provider listing. The
 * daemon does not transport full descriptor metadata, so capability fields
 * default to the conservative remote baseline: follow-up mid-run input only
 * and no attachment ingestion (byte transfer lands with MAR-1415).
 *
 * The id is translated into the local namespace, because this descriptor is
 * what a session is picked from and a session records the local id (MAR-2682).
 * A catalog that handed out daemon ids would be offering rows that
 * `resolveExecution` translates a second time and then cannot find.
 *
 * There is no vendor label, and the blank is the answer rather than a gap. The
 * option row renders `vendorLabel || name` as a provider's primary label, so a
 * constant here made every provider on every daemon read "Remote daemon" — one
 * word in the three places three different providers should have been. The
 * vendor of a remote run is the Endpoint, and naming the machine is the strip's
 * job, one tier below and already done; this row's job is to say *which
 * provider*, which is `name`.
 */
export function descriptorForRemoteProvider(
  info: RemoteExecutionHostProviderInfo,
): ProviderDescriptor {
  return {
    id: localProviderIdForRemoteProvider(info.providerId),
    name: info.name,
    vendorLabel: '',
    kind: 'conversation',
    supportsContinuation: info.supportsContinuation,
    defaultModelId: info.models[0]?.id ?? '',
    modelOptions: info.models.map((model) => ({
      id: model.id,
      label: model.label,
      defaultEffort: null,
      effortOptions: [],
      source: 'provider' as const,
    })),
    attachments: {
      supportsImage: false,
      supportsPdf: false,
      supportsText: false,
      maxImageBytes: 0,
      maxPdfBytes: 0,
      maxTextBytes: 0,
      maxTotalBytes: 0,
    },
    midRunInput: {
      supportsAnswer: false,
      supportsNativeFollowUp: true,
      supportsAppQueuedFollowUp: false,
      supportsSteer: false,
      supportsInterrupt: true,
      defaultRunningMode: 'follow-up',
    },
  }
}

/**
 * The one place the two provider namespaces meet (MAR-2682).
 *
 * The daemon and the local registry grew separate names for the same CLI --
 * `claude-code` here, `claude` there -- and that difference is the entire
 * content of this table. A pair goes in here or nowhere: two functions each
 * holding their own half is how one direction gains an entry the other lacks,
 * and a provider that translates out but not back is a session that starts and
 * can never be described again.
 *
 * Absence is deliberately not a claim. Everything unlisted translates to
 * itself, because a table that answered "no such provider" for an id it merely
 * does not know would be this file asserting what some daemon can run -- the
 * same guess `REMOTE_CAPABLE_PROVIDER_IDS` made in the composer, in the same
 * shape, and MAR-2619's "nothing local may assert a remote fact" deletes both.
 * What a machine can run is what its
 * own listing says.
 */
const PROVIDER_ID_PAIRS: ReadonlyArray<
  readonly [localProviderId: string, remoteProviderId: string]
> = [['claude-code', 'claude']]

/**
 * The id the daemon knows a local provider by. Sessions always store the local
 * id and translate at the host boundary.
 */
export function remoteProviderIdForLocalProvider(
  localProviderId: string,
): string {
  const pair = PROVIDER_ID_PAIRS.find(([local]) => local === localProviderId)
  return pair ? pair[1] : localProviderId
}

/**
 * The id the local registry knows a daemon provider by -- the inverse of
 * `remoteProviderIdForLocalProvider`, derived from the same pairs so the two
 * cannot disagree.
 */
export function localProviderIdForRemoteProvider(
  remoteProviderId: string,
): string {
  const pair = PROVIDER_ID_PAIRS.find(
    ([, remote]) => remote === remoteProviderId,
  )
  return pair ? pair[0] : remoteProviderId
}

/**
 * Why this daemon will not run this provider, in the daemon's own words, or
 * null when it will (MAR-2682).
 *
 * Nothing here is diagnosed locally. `available` and `authenticated` are the
 * daemon's verdict and `details` is its explanation -- `'missing binary'`, and
 * whatever else it learns to say -- so a disabled row quotes the machine rather
 * than guessing on its behalf. A daemon that sends no `details` still gets a
 * true sentence, just a shorter one: what it reported, with nothing added.
 *
 * Availability is read before authentication because a CLI that is not there
 * cannot be signed in, and leading with the sign-in would send a reader hunting
 * for credentials on a machine that has nothing to sign in to.
 */
export function describeRemoteProviderBlock(
  info: RemoteExecutionHostProviderInfo,
): string | null {
  const state = !info.available
    ? 'unavailable'
    : !info.authenticated
      ? 'not signed in'
      : null
  if (!state) return null
  const because = info.details ? `: ${info.details}` : ''
  return `The daemon reports ${info.name} as ${state}${because}.`
}

/**
 * What Settings says about a connected daemon's provider listing (MAR-2682).
 *
 * "Available" means one thing in this app: a provider the machine will
 * actually run. The count therefore comes from `describeRemoteProviderBlock`,
 * the same derivation the option row filters on -- it used to be
 * `providers.length`, so Settings said five while the composer offered three,
 * about the same daemon in the same app.
 *
 * The blocked ones are named rather than dropped, for the reason a disabled row
 * is kept: a human who installed five CLIs and is told about three needs to
 * know which two the daemon will not run, and where to go and look.
 */
export function describeRemoteProviderListing(
  providers: readonly RemoteExecutionHostProviderInfo[],
): string {
  const blocked = providers.filter(
    (info) => describeRemoteProviderBlock(info) !== null,
  )
  const runnable = providers.length - blocked.length
  const counted = `${runnable} provider${runnable === 1 ? '' : 's'} available`
  if (blocked.length === 0) return `${counted}.`
  return `${counted}, ${blocked.length} blocked: ${blocked
    .map((info) => info.name)
    .join(', ')}.`
}

/**
 * One row of a remote machine's catalog: what the provider is, and whether that
 * machine will take a session on it (MAR-2682).
 */
export function catalogEntryForRemoteProvider(
  info: RemoteExecutionHostProviderInfo,
): ProviderCatalogEntry {
  return {
    descriptor: descriptorForRemoteProvider(info),
    blockedReason: describeRemoteProviderBlock(info),
  }
}

/** Parses the daemon start response and pins the echoed session id. */
export function parseRemoteExecutionHostStartResponse(value: unknown): {
  sessionId: string
} {
  if (!isRecord(value) || typeof value.sessionId !== 'string') {
    throw new RemoteExecutionHostError(
      'Remote daemon returned a malformed start response.',
      'malformed',
    )
  }
  return { sessionId: value.sessionId }
}

export interface SseEvent {
  id: string | null
  data: string
}

/**
 * Incremental parser for a text/event-stream byte stream. Feed decoded
 * chunks in arrival order; complete events (terminated by a blank line) are
 * returned as they form. Comment lines and unknown fields are ignored;
 * multiple data lines join with newlines per the SSE specification.
 */
export function createSseParser(): { feed: (chunk: string) => SseEvent[] } {
  let buffer = ''
  let dataLines: string[] = []
  let id: string | null = null

  return {
    feed(chunk: string): SseEvent[] {
      buffer += chunk
      const events: SseEvent[] = []

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')

        if (line === '') {
          if (dataLines.length > 0) {
            events.push({ id, data: dataLines.join('\n') })
          }
          dataLines = []
          id = null
          continue
        }
        if (line.startsWith(':')) continue

        const colonIndex = line.indexOf(':')
        const field = colonIndex === -1 ? line : line.slice(0, colonIndex)
        let fieldValue = colonIndex === -1 ? '' : line.slice(colonIndex + 1)
        if (fieldValue.startsWith(' ')) fieldValue = fieldValue.slice(1)

        if (field === 'data') dataLines.push(fieldValue)
        else if (field === 'id') id = fieldValue
      }

      return events
    },
  }
}

export type { RemoteSessionWorkspaceInfo }

/**
 * Parses the workspace slice out of a daemon session snapshot. Throws
 * RemoteExecutionHostError('malformed') when the snapshot is not an object.
 */
export function parseRemoteSessionWorkspaceInfo(
  value: unknown,
): RemoteSessionWorkspaceInfo {
  if (!isRecord(value)) {
    throw new RemoteExecutionHostError(
      'Remote daemon returned a malformed session snapshot.',
      'malformed',
    )
  }

  const workspace = isRecord(value.workspace) ? value.workspace : null
  return {
    workspace:
      workspace &&
      typeof workspace.repository === 'string' &&
      typeof workspace.branchName === 'string'
        ? {
            repository: workspace.repository,
            branchName: workspace.branchName,
            baseRef:
              typeof workspace.baseRef === 'string' ? workspace.baseRef : null,
          }
        : null,
    prUrl: typeof value.prUrl === 'string' ? value.prUrl : null,
  }
}

/**
 * The refusal a Remote Execution Host gives for a provider it will not start.
 *
 * "Provider not found" is a claim about what the daemon answered, so it may
 * only be made once the daemon has answered. The host decides by reading its
 * own provider cache, and an empty cache is two different facts wearing one
 * shape: a daemon that listed no such provider, and a daemon that was never
 * asked or never replied. Reporting the first when it is the second sends the
 * reader hunting a provider problem that does not exist, on a machine whose
 * real trouble is that nothing ever reached it (MAR-2620).
 */
export function unavailableProviderError(input: {
  providerId: string
  /**
   * Whether a provider listing has landed for the daemon configuration this
   * host is pointed at now. A listing read from an address the Endpoint has
   * since been edited away from is not one: it says nothing about the machine
   * the refusal is about.
   */
  listed: boolean
  /** Why the most recent listing failed, when one did. */
  listingFailure: Error | null
}): Error {
  if (input.listed) {
    return new Error(`Provider not found: ${input.providerId}`)
  }

  const failure = input.listingFailure
  if (!failure) {
    return new Error(
      `Cannot start ${input.providerId}: the remote execution host has not ` +
        'listed its providers yet.',
    )
  }

  const message =
    `Cannot start ${input.providerId}: the remote execution host never ` +
    `listed its providers. ${failure.message}`
  // The kind survives the rewrap, so the settings connection test and the
  // conversation note still classify this the way they classify the listing
  // failure it came from.
  return failure instanceof RemoteExecutionHostError
    ? new RemoteExecutionHostError(
        message,
        failure.kind,
        failure.status,
        failure,
      )
    : new Error(message)
}

/**
 * The refusal a Remote Execution Host gives for a provider the daemon listed
 * but will not run (MAR-2682).
 *
 * The block was only ever enforced in the renderer, by keeping the entry out of
 * `selectableProviderDescriptors`. That is where it belongs for *picking*, and
 * it is not where a refusal belongs: a start can arrive from a resumed session,
 * a relay, or any surface that never read the option row, and the daemon would
 * have rejected all of them after a round trip with a message of its own
 * choosing. Refused here, in the daemon's own words, beside the sibling refusal
 * for a provider it never listed at all.
 *
 * A plain Error, like `Provider not found` above: the daemon answered, so this
 * is not a configuration, auth, network or transport failure, and typing it as
 * one would misclassify it for the settings connection test.
 */
export function blockedProviderError(
  providerId: string,
  blockedReason: string,
): Error {
  return new Error(`Cannot start ${providerId}: ${blockedReason}`)
}

/**
 * Renders a remote failure for the conversation note: the underlying
 * message, the HTTP status when one exists, and an actionable hint derived
 * from the error kind so users can self-diagnose without daemon log access.
 */
export function describeRemoteExecutionHostFailure(error: unknown): string {
  const base = error instanceof Error ? error.message : String(error)
  if (!(error instanceof RemoteExecutionHostError)) return base
  const status = error.status ? ` (HTTP ${error.status})` : ''
  const hint = remoteFailureHint(error.kind)
  return `${base}${status}${hint ? ` ${hint}` : ''}`
}

function remoteFailureHint(
  kind: RemoteExecutionHostError['kind'],
): string | null {
  switch (kind) {
    case 'configuration':
      return 'Configure the daemon in Settings under Remote execution host.'
    case 'auth':
      return 'The daemon rejected the API token; update it in Settings under Remote execution host.'
    case 'network':
      return 'The daemon is unreachable; verify it with Test connection in Settings under Remote execution host.'
    case 'malformed':
      return 'The daemon sent an unexpected response; it may need an update.'
    case 'http':
      return null
  }
}

const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 30_000

/** Exponential backoff for SSE reconnects: 1s, 2s, 4s, ... capped at 30s. */
export function remoteExecutionHostReconnectDelayMs(attempt: number): number {
  const exponent = Math.max(0, attempt - 1)
  return Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** exponent,
    RECONNECT_MAX_DELAY_MS,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
