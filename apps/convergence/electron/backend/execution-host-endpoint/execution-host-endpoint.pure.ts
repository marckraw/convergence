import type { ExecutionHostEndpointInput } from './execution-host-endpoint.types'

/**
 * The one execution host that is not an Endpoint: this machine (MAR-2620).
 *
 * Every other value `sessions.execution_host` can hold is an Endpoint id, so
 * `'local'` is the only literal any branch may compare against. Nothing in the
 * codebase may test for the string `'remote'` again — it named a single daemon
 * back when there could only be one, and it cannot name which of several.
 */
export const LOCAL_EXECUTION_HOST_ID = 'local'

/**
 * The id the Endpoint born from the single-host era carries.
 *
 * It is deliberately the account name the daemon token already uses in the
 * Keychain (`convergence.execution-host-daemon` / `default`), because the
 * Keychain account for an Endpoint is its id. Choosing anything else here
 * would orphan the one token that is already stored and turn "nothing visible
 * changes" into a remote host that stopped authenticating.
 */
export const DEFAULT_EXECUTION_HOST_ENDPOINT_ID = 'default'

/** The label the migrated Endpoint carries; it is what the UI already says. */
export const DEFAULT_EXECUTION_HOST_ENDPOINT_LABEL = 'Remote daemon'

/**
 * Reserved id for pre-MAR-2620 remote sessions that cannot be attributed.
 *
 * A session that ran on `'remote'` while no base URL is configured ran on a
 * daemon whose address the record no longer holds. There is no Endpoint with
 * this id and there never will be: naming one would be a guess at which
 * machine, and a guess is exactly the failure this era exists to prevent.
 * Sessions carrying it resolve to nothing and fail honestly.
 */
export const LEGACY_REMOTE_EXECUTION_HOST_ID = 'legacy-remote'

/** Runs inside this app process. */
export function isLocalExecutionHost(
  executionHostId: string | null | undefined,
): boolean {
  return parseExecutionHostId(executionHostId) === LOCAL_EXECUTION_HOST_ID
}

/** Runs on some Endpoint — which one is the id itself, never a boolean. */
export function isRemoteExecutionHost(
  executionHostId: string | null | undefined,
): boolean {
  return !isLocalExecutionHost(executionHostId)
}

/**
 * Reads an execution host id off a record. Absent or blank means local: that is
 * what every row written before execution hosts existed meant.
 */
export function parseExecutionHostId(value: string | null | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || LOCAL_EXECUTION_HOST_ID
}

/**
 * What a session says when the Endpoint it names is gone.
 *
 * The alternative — resolving to whichever Endpoint happens to be configured —
 * would run the session on a machine it never agreed to, with the transcript
 * still asserting the old one. Refusing is the only honest answer, so the
 * message says which id went missing rather than hiding behind "not
 * configured".
 */
export function describeMissingExecutionHostEndpoint(
  executionHostId: string,
): string {
  return (
    `This session runs on execution host endpoint "${executionHostId}", ` +
    'which is not configured. Add it back in Settings, or start a new ' +
    'session on a host that exists — running it anywhere else would use a ' +
    'machine this session never named.'
  )
}

const BASE_URL_ERROR = 'Remote execution host base URL must be an HTTP(S) URL.'

/**
 * Normalizes a base URL to an origin with no trailing slash, or null when it is
 * not an HTTP(S) URL at all. Shared by the settings write path and the parser
 * so a stored URL and a freshly typed one normalize identically.
 */
export function normalizeExecutionHostBaseUrl(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.href.replace(/\/+$/, '')
  } catch {
    return null
  }
}

const MISSING_ID_ERROR =
  'An execution host endpoint must carry its own id: an endpoint with no id ' +
  'would inherit another machine’s sessions and its Keychain account.'

/**
 * The shape an Endpoint id is allowed to have (MAR-2642).
 *
 * An id is not only a key in this database. It is the Keychain account its
 * daemon token is filed under, and that account reaches `security` inside a
 * command `security -i` reads a line at a time — so an id carrying a newline
 * is a second keychain command, and one carrying a space or a quote names a
 * different account than the session recorded. The listing the orphan sweep
 * reads cannot see a quoted account either.
 *
 * Nothing legal is excluded: ids are minted as UUIDs, and the one that was not
 * is the migrated `'default'`. The length bound is the second half — `security`
 * and the Keychain have limits of their own, and an id long enough to reach one
 * would fail somewhere this code cannot look.
 */
const ENDPOINT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** True for an id that can be an Endpoint's and a Keychain account's alike. */
export function isExecutionHostEndpointId(value: string): boolean {
  return ENDPOINT_ID_PATTERN.test(value)
}

/** Says which id was refused, in a form a newline cannot hide inside. */
export function describeInvalidExecutionHostEndpointId(value: string): string {
  return (
    `Execution host endpoint id ${JSON.stringify(value)} is not usable: an ` +
    'id may hold only letters, digits, hyphens and underscores, up to 64 of ' +
    'them. An id names a Keychain account as well as a machine, and anything ' +
    'else could name a second one.'
  )
}

/**
 * Refuses an id that is not one, by name (MAR-2642).
 *
 * Refuses rather than repairs, and that is the whole point. A sanitised id is
 * still an id — just a different one — so quietly rewriting it would file a
 * token under an account nothing will ever read and strand every session that
 * recorded the original. The refusal names the value so the machine that is
 * being turned away can be identified.
 *
 * Applied wherever an id enters: the save path below, and the read path in
 * `ExecutionHostEndpointRepository`, because an id read back off disk reaches
 * `security` exactly like one typed today.
 */
export function requireExecutionHostEndpointId(value: string): string {
  if (!isExecutionHostEndpointId(value)) {
    throw new Error(describeInvalidExecutionHostEndpointId(value))
  }
  return value
}

/**
 * Turns what the settings surface sent into the rows the repository writes.
 *
 * Rejects rather than drops: a base URL that will not normalize is the user's
 * typo, and silently storing zero endpoints would tell them the daemon is
 * simply unconfigured. Endpoint ids are deduplicated for the same reason a
 * session must resolve to exactly one machine.
 *
 * A blank id is refused rather than filled in (MAR-2642). It used to fall back
 * to `DEFAULT_EXECUTION_HOST_ENDPOINT_ID`, which is not a spare id — it is the
 * one the single-host era's sessions recorded and the one its Keychain entry
 * is filed under. Handing it to a machine that never had it hands over both.
 *
 * An id that is not blank is taken exactly as given, or refused: it used to be
 * trimmed, which is a quiet rewrite of the one value that must not be rewritten
 * — ` kuba ` stored as `kuba` files its token under an account the caller never
 * named. `requireExecutionHostEndpointId` decides what an id may be.
 */
export function normalizeExecutionHostEndpoints(
  inputs: readonly ExecutionHostEndpointInput[],
): Array<{ id: string; label: string; baseUrl: string; position: number }> {
  const seen = new Set<string>()
  return inputs.map((input, index) => {
    const baseUrl = normalizeExecutionHostBaseUrl(input.baseUrl)
    if (!baseUrl) throw new Error(BASE_URL_ERROR)

    const id = input.id ?? ''
    if (!id.trim()) throw new Error(MISSING_ID_ERROR)
    if (id === LOCAL_EXECUTION_HOST_ID) {
      throw new Error(
        `"${LOCAL_EXECUTION_HOST_ID}" is this machine and cannot be an execution host endpoint.`,
      )
    }
    requireExecutionHostEndpointId(id)
    if (seen.has(id)) {
      throw new Error(`Duplicate execution host endpoint id: ${id}`)
    }
    seen.add(id)

    return {
      id,
      label:
        (input.label ?? '').trim() || DEFAULT_EXECUTION_HOST_ENDPOINT_LABEL,
      baseUrl,
      position: index,
    }
  })
}

/**
 * The Endpoint ids a save removes: stored now, and not in what it will store.
 *
 * Which ids survive is `normalizeExecutionHostEndpoints`' decision, so this
 * asks it rather than re-reading the input's ids itself — a second encoding of
 * that rule would agree with the first only until one of them changed. It
 * therefore also throws on a list that will not normalize, which is what lets a
 * caller price a removal before writing or destroying anything.
 */
export function removedExecutionHostEndpointIds(
  stored: readonly { id: string }[],
  inputs: readonly ExecutionHostEndpointInput[],
): string[] {
  const kept = new Set(
    normalizeExecutionHostEndpoints(inputs).map((endpoint) => endpoint.id),
  )
  return stored.map((endpoint) => endpoint.id).filter((id) => !kept.has(id))
}

export {
  BASE_URL_ERROR as EXECUTION_HOST_BASE_URL_ERROR,
  MISSING_ID_ERROR as EXECUTION_HOST_ENDPOINT_MISSING_ID_ERROR,
}
