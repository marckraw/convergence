/**
 * Everything this client derives from a daemon's own bytes, and nothing it
 * derives about the app around it (MAR-2737).
 *
 * The split this file was born from is the package boundary itself: the halves
 * that read `/health`, `/v0/meta`, a start response, a session snapshot and an
 * SSE stream came here, and the halves that turn those readings into
 * Convergence's provider descriptors, catalog rows and refusal sentences stayed
 * in the app as `remote-execution-host.pure.ts` beside the host. Nothing in
 * here may name an app's vocabulary — a `ProviderDescriptor` import is the
 * signal that a function belongs on the other side of the line.
 */
import {
  decodeExecutionSessionWorkspace,
  type ExecutionSessionWorkspace,
} from '@mrck-labs/execution-host-protocol'
import type { EndpointHandshakeResult } from './execution-host-handshake.types'
import {
  RemoteExecutionHostError,
  type RemoteExecutionHostConnection,
  type RemoteExecutionHostProviderInfo,
  type RemoteSessionPullRequest,
  type RemoteSessionWorkspaceInfo,
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

/** What a daemon said about the session it just accepted (MAR-2694). */
export interface RemoteStartEcho {
  sessionId: string
  workspace: ExecutionSessionWorkspace | null
  /** Why an echoed workspace was not usable, when one was sent and was not. */
  unreadableWorkspaceReason: string | null
}

/**
 * Parses the daemon start response: the workspace the daemon says it
 * materialised, for the session that was asked about (MAR-2694).
 *
 * The workspace arrives here from protocol 0.14 onward, which is why the record
 * no longer has to wait for a fetch to know where a session works. It is
 * decoded by the protocol's own decoder -- the same one the fetch door uses,
 * because it is the same wire shape.
 *
 * The echoed id is checked against the one that was asked for, and a response
 * about any other session is refused. It used to be returned and dropped, and
 * the workspace written under the requested id whatever the daemon answered --
 * so a crossed or buggy response put another run's place on this row's durable
 * record, which looks exactly as convincing as the right one. A daemon that
 * answered about a run we did not ask for is not a daemon we can attach to
 * either, so this refusal fails the start rather than degrading (MAR-2694
 * round 2).
 *
 * An unreadable workspace does NOT fail the start, and that asymmetry with
 * `parseRemoteSessionWorkspaceInfo` is deliberate. This response answers one
 * question -- did the session start? -- and by the time it arrives the daemon
 * has already created a run that a second start is refused for with 409.
 * Failing the whole start over a field that only saves a later fetch would
 * strand a live session, and it would make a protocol version this build
 * predates -- an added workspace `mode`, say -- break remote work outright
 * rather than degrade it.
 *
 * So it degrades, and says so: the reason comes back beside the value instead
 * of being swallowed, because a drop nobody can see is its own defect. The
 * caller records it, and the workspace is asked for again through the fetch
 * door, which refuses out loud.
 */
export function parseRemoteExecutionHostStartResponse(
  value: unknown,
  expectedSessionId: string,
): RemoteStartEcho {
  if (!isRecord(value)) {
    throw new RemoteExecutionHostError(
      'Remote daemon returned a malformed start response.',
      'malformed',
    )
  }
  const sessionId = requireEchoedSessionId(
    value.sessionId,
    expectedSessionId,
    'start response',
  )
  if (value.workspace === undefined || value.workspace === null) {
    return {
      sessionId,
      workspace: null,
      unreadableWorkspaceReason: null,
    }
  }
  const decoded = decodeExecutionSessionWorkspace(value.workspace)
  return {
    sessionId,
    workspace: decoded.ok ? decoded.value : null,
    unreadableWorkspaceReason: decoded.ok ? null : decoded.reason,
  }
}

/**
 * The session id a daemon answer must carry to be an answer about this session
 * (MAR-2694 round 2).
 *
 * Exact or refused, at both doors and through one predicate, because the two
 * doors write to the same durable record and a rule that lived at one of them
 * would be a rule the other did not have. Missing and blank are refused beside
 * a mismatch: an answer that names no session is not evidence that it is about
 * this one, and reading it as though it were is how the workspace of another
 * run reaches a row that never touched it.
 */
function requireEchoedSessionId(
  value: unknown,
  expectedSessionId: string,
  door: string,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RemoteExecutionHostError(
      `Remote daemon returned a ${door} naming no session.`,
      'malformed',
    )
  }
  if (value !== expectedSessionId) {
    throw new RemoteExecutionHostError(
      `Remote daemon returned a ${door} for session ${value}, not ${expectedSessionId}.`,
      'malformed',
    )
  }
  return value
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

/**
 * Reads the workspace a daemon says a session actually got, and the pull
 * request it opened for it (MAR-2694).
 *
 * The decode is the protocol's own `decodeExecutionSessionWorkspace` and not a
 * second reading of the same bytes. This file used to carry a hand-rolled one
 * that knew about `repository`, `branchName` and `baseRef` and nothing else, so
 * protocol 0.14's Project mode -- `origin`, `originKey`, the checkout's actual
 * `branchName`, `requestedBranchName` when the two differ -- would have arrived
 * and been discarded as "not a workspace". Two decoders for one wire shape is
 * how a field the daemon started sending goes unread for a release; there is
 * one now, and it is the one the daemon encodes with.
 *
 * The legacy shape still lands, and by the protocol's rule rather than ours: a
 * payload with no `mode` is read as Repository mode, which is exactly what a
 * pre-0.14 daemon's `{ repository, branchName, baseRef }` is.
 *
 * A workspace the daemon did not report and one it reported wrongly are
 * different answers and get different outcomes. Absent -- the key missing, or
 * `null` -- is a real answer: the session has not been materialised yet, and
 * `null` says so. Present but undecodable is refused out loud, because the
 * alternative is `null`-as-success: the panel would say "no workspace" about a
 * daemon that is telling us something we failed to read, which is the shape
 * this era exists to end (MAR-2619).
 *
 * The snapshot names its own session (`docs/architecture/execution-host-wire-
 * protocol.md`), and that name has to be the one that was asked for. This
 * decoder used not to look at it at all while its caller wrote the returned
 * workspace under the id it had requested, so a crossed answer described this
 * row with another run's workspace -- the same hole the start door had, and
 * closed here by the same predicate rather than by a second rule that could
 * drift from it (MAR-2694 round 2).
 */
export function parseRemoteSessionWorkspaceInfo(
  value: unknown,
  expectedSessionId: string,
): RemoteSessionWorkspaceInfo {
  if (!isRecord(value)) {
    throw new RemoteExecutionHostError(
      'Remote daemon returned a malformed session snapshot.',
      'malformed',
    )
  }
  requireEchoedSessionId(value.sessionId, expectedSessionId, 'session snapshot')

  const pullRequest = readEchoedPullRequest(value)
  if (value.workspace === undefined || value.workspace === null) {
    return { workspace: null, pullRequest }
  }

  const decoded = decodeExecutionSessionWorkspace(value.workspace)
  if (!decoded.ok) {
    throw new RemoteExecutionHostError(
      `Remote daemon returned a workspace this build cannot read: ${decoded.reason}.`,
      'malformed',
    )
  }
  return { workspace: decoded.value, pullRequest }
}

/**
 * Reads the pull request out of a session snapshot, at the door that reads the
 * bytes (MAR-2718 round 2).
 *
 * `typeof value.prUrl === 'string' ? value.prUrl : null` collapsed five
 * different situations into one: the key missing, a number, `false`, a blank
 * string, a non-HTTP string -- and the daemon's own explicit `null`. Only the
 * last of those is an answer, and the panel is allowed to render it as `None
 * yet`, a claim that somebody looked. The daemon always emits the field
 * (`prUrl: session.prUrl ?? null`), so an own explicit `null` is its negative
 * and silence is not.
 *
 * Exact or refused, and refused narrowly: an unreadable pull request never
 * refuses the whole snapshot, because the workspace half is still the daemon's
 * truth and the branch has to stay visible while this field is in doubt.
 *
 * `isHttpUrl` is the protocol's own rule for this field, applied where the
 * protocol does not decode for us -- a value that is not an `http(s)` URL is
 * one no surface can offer as a link, and printing it would be the same lie in
 * a different font.
 */
function readEchoedPullRequest(
  value: Record<string, unknown>,
): RemoteSessionPullRequest {
  if (!Object.hasOwn(value, 'prUrl')) {
    return {
      kind: 'unreadable',
      reason: 'the daemon sent no pull request field',
    }
  }
  const raw = value.prUrl
  if (raw === null) return { kind: 'none' }
  if (typeof raw !== 'string') {
    return {
      kind: 'unreadable',
      reason: `the daemon sent a pull request as a ${typeof raw}, not a URL`,
    }
  }
  if (!isHttpUrl(raw)) {
    return {
      kind: 'unreadable',
      reason: 'the daemon sent a pull request that is not an http(s) URL',
    }
  }
  return { kind: 'url', url: raw }
}

/** The protocol's rule for a pull request URL (`codecs.ts`), which it does not export. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
