import type {
  ExecutionHostDaemonEnvironmentOverride,
  ExecutionHostSessionCount,
  RemoteExecutionHostConnectionResult,
} from '@/entities/app-settings'
import {
  executionHostEndpointDisplayName,
  type ExecutionHostEndpoint,
} from '@/entities/execution-host'

/** One Endpoint as the settings form is currently holding it. */
export interface ExecutionHostEndpointDraft {
  id: string
  label: string
  baseUrl: string
}

const INVALID_BASE_URL_ERROR =
  'Remote execution host base URL must be a valid HTTP(S) URL.'
const EMPTY_BASE_URL_ERROR =
  'Enter a base URL, or remove this endpoint — an endpoint with no address names no machine.'

/**
 * Normalizes a base URL to the form the backend stores, or null when it is not
 * an HTTP(S) URL at all.
 *
 * Mirrors `normalizeExecutionHostBaseUrl` in
 * `electron/backend/execution-host-endpoint/execution-host-endpoint.pure.ts` —
 * keep the two in sync. The renderer needs it to answer one question the
 * backend never asks: whether what is typed is still the address that was
 * saved. Comparing raw strings would call `HTTPS://Daemon.Test` an edit of
 * `https://daemon.test` and block a test that would have worked.
 */
export function normalizeExecutionHostBaseUrl(value: string): string | null {
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

export function getExecutionHostRemoteBaseUrlError(
  value: string,
): string | null {
  if (!value.trim()) return null
  return normalizeExecutionHostBaseUrl(value) ? null : INVALID_BASE_URL_ERROR
}

/**
 * The error a row's base URL carries, blank included (MAR-2642).
 *
 * Blank used to mean "remove the remote host", because one field edited one
 * daemon and clearing it was the only way to unconfigure it. With a list and an
 * explicit Remove, a blank URL is a row the user has not finished — saving it
 * would throw at the repository, and dropping it silently would report a
 * machine as unconfigured that they had just typed.
 */
export function getExecutionHostEndpointBaseUrlError(
  value: string,
): string | null {
  if (!value.trim()) return EMPTY_BASE_URL_ERROR
  return getExecutionHostRemoteBaseUrlError(value)
}

/** True when any row would refuse to save. Blocks Save, exactly as before. */
export function hasExecutionHostEndpointErrors(
  drafts: readonly ExecutionHostEndpointDraft[],
): boolean {
  return drafts.some(
    (draft) => getExecutionHostEndpointBaseUrlError(draft.baseUrl) !== null,
  )
}

/**
 * The id a newly added Endpoint takes (MAR-2642): always a minted one.
 *
 * Never `'default'`. That id is not a free slot that happens to be empty — it
 * belongs to the Endpoint the single-host era became, and two things are keyed
 * to it and to nothing else: the Keychain account that era wrote a token to,
 * and `CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN`. Handing it to a machine
 * created later hands over both, plus every session that recorded it.
 *
 * It used to be claimed by whichever row asked while no row held it, which is
 * a different question from whether it was ever used: remove the Endpoint that
 * owned it and the very next Add inherits its identity. Not-currently-taken is
 * not never-used, so ids are minted unconditionally and never reused. An
 * Endpoint that already has `'default'` keeps it — seeding carries stored ids
 * through — which is the only way any row ever holds it again.
 */
export function nextExecutionHostEndpointId(
  drafts: readonly ExecutionHostEndpointDraft[],
  mintId: () => string,
): string {
  const taken = new Set(drafts.map((draft) => draft.id))
  let minted = mintId()
  while (taken.has(minted)) minted = mintId()
  return minted
}

/** Seeds the form from what is stored, ids included, so no row is reissued. */
export function executionHostEndpointDrafts(
  endpoints: readonly ExecutionHostEndpoint[],
): ExecutionHostEndpointDraft[] {
  return endpoints.map((endpoint) => ({
    id: endpoint.id,
    label: endpoint.label,
    baseUrl: endpoint.baseUrl,
  }))
}

export interface ExecutionHostEndpointActionBlocks {
  /** Why Save token / Remove token cannot act yet, or null. */
  token: string | null
  /** Why Test connection cannot act yet, or null. */
  connection: string | null
}

const UNSAVED_ENDPOINT_BLOCK =
  'Save settings first — this endpoint does not exist yet.'

/**
 * Why a row's daemon actions would act on something other than what it shows
 * (MAR-2642) — the era's whole constraint, one derivation and two readings of
 * it rather than two rules that agree by luck.
 *
 * Both actions reach stored state, not the draft: a token is filed under the
 * Endpoint's id, and the connection test dials the Endpoint's saved base URL.
 * So a row that has never been saved can do neither — a test would answer "base
 * URL is not configured" over a URL the user is looking at. A row whose URL has
 * been edited can still hold a token, because the Keychain account is the id
 * and the id did not change, but cannot be tested, because the test would dial
 * the address it is about to stop having.
 */
export function describeExecutionHostEndpointActionBlocks(input: {
  draft: ExecutionHostEndpointDraft
  saved: ExecutionHostEndpoint | null | undefined
}): ExecutionHostEndpointActionBlocks {
  if (!input.saved) {
    return { token: UNSAVED_ENDPOINT_BLOCK, connection: UNSAVED_ENDPOINT_BLOCK }
  }

  const typed = normalizeExecutionHostBaseUrl(input.draft.baseUrl)
  if (typed !== input.saved.baseUrl) {
    return {
      token: null,
      connection:
        'Save to test the URL you typed — this endpoint still points at ' +
        `${input.saved.baseUrl}.`,
    }
  }

  return { token: null, connection: null }
}

/**
 * How many sessions name each Endpoint, and whether Convergence knows yet
 * (MAR-2642).
 *
 * Three states, not a nullable number: "still counting" and "the count failed"
 * are different facts and the surface says different things about them, while
 * an absent number would collapse both into whatever the reader assumed. The
 * counted case holds a `Map` because it is indexed by Endpoint ids, which come
 * from the user's own configuration — a bare object answers `'toString'` with
 * a function and never holds `'__proto__'` at all.
 */
export type ExecutionHostSessionCounts =
  | { status: 'counting' }
  | { status: 'failed' }
  | CountedExecutionHostSessions

/** A count that arrived. */
export interface CountedExecutionHostSessions {
  status: 'counted'
  byEndpointId: ReadonlyMap<string, number>
}

/**
 * A count that will not change by waiting: it landed, or it failed trying.
 * Anything that prices a removal takes this, never the open union — a price
 * quoted from a count still in flight is a guess.
 */
export type SettledExecutionHostSessionCounts = Exclude<
  ExecutionHostSessionCounts,
  { status: 'counting' }
>

/** Turns what the main process counted into the form rows read. */
export function executionHostSessionCounts(
  counts: readonly ExecutionHostSessionCount[],
): CountedExecutionHostSessions {
  return {
    status: 'counted',
    byEndpointId: new Map(
      counts.map((count) => [count.executionHostId, count.sessions]),
    ),
  }
}

/**
 * Why Remove cannot act yet, or null when it can (MAR-2642).
 *
 * A removal is priced by a count, so it cannot be authorised before the count
 * arrives: treating "not counted yet" as "counts nothing" is how a stale zero
 * strands live sessions. A count that *failed* is a different fact — waiting
 * will not produce it, and refusing forever would leave the Endpoint
 * unremovable — so that one is a warning to acknowledge rather than a block.
 */
export function describeExecutionHostEndpointRemovalBlock(input: {
  label: string
  counts: ExecutionHostSessionCounts
}): string | null {
  if (input.counts.status !== 'counting') return null
  const name = executionHostEndpointDisplayName({ label: input.label })
  return (
    `Still counting the sessions that run on “${name}” — a removal cannot ` +
    'be priced until that lands.'
  )
}

/**
 * What removing an Endpoint costs, or null when it costs nothing (MAR-2642).
 *
 * Slice 1 made a session whose Endpoint is gone refuse to run rather than
 * silently move to another machine, so a removal is never free once anything
 * names it. Only a count that arrived and said zero is free: a count that
 * failed is a cost, because presenting a removal as free because Convergence
 * failed to price it is the lie this era exists to prevent.
 *
 * A count still in flight cannot be asked about at all. It is excluded by the
 * parameter type rather than answered here, because the two answers this could
 * give are both wrong: "free" strands sessions, and a warning would open a
 * confirmation whose sentence changes underneath it the moment the count
 * lands. `describeExecutionHostEndpointRemovalBlock` refuses that state
 * instead, and Remove waits.
 */
export function describeExecutionHostEndpointRemoval(input: {
  label: string
  endpointId: string
  counts: SettledExecutionHostSessionCounts
}): string | null {
  const name = executionHostEndpointDisplayName({ label: input.label })
  if (input.counts.status === 'failed') {
    return (
      `Convergence could not count the sessions that run on “${name}”. ` +
      'Any session that names it will refuse to run once it is gone.'
    )
  }

  const sessionCount = input.counts.byEndpointId.get(input.endpointId) ?? 0
  if (sessionCount <= 0) return null
  const sessions =
    sessionCount === 1 ? '1 session runs' : `${sessionCount} sessions run`
  return (
    `${sessions} on “${name}”. Removing it does not move them — they will ` +
    'refuse to run, because a session may only run on the machine it named.'
  )
}

/**
 * A connection test's answer, and the whole of what that answer is about.
 *
 * A test dials one address with one token, so both travel inside the answer.
 * Carrying only the address would leave a green "Connected" standing under a
 * token that has since been replaced or removed — the same staleness the
 * address solves, in the other dimension.
 */
export interface ExecutionHostConnectionAttempt {
  /** The normalized address this row showed when the test was dispatched. */
  baseUrl: string | null
  /**
   * Which of this row's token eras dialled. Counts the token changes this
   * surface made rather than naming the token: a generation can be compared,
   * logged and rendered, and a secret cannot.
   */
  tokenGeneration: number
  result: RemoteExecutionHostConnectionResult
}

/**
 * The connection result that is still about the machine on screen (MAR-2642).
 *
 * A test answers for one machine at one address with one token. Leaving a green
 * "Connected" sitting under an address that has since been retyped, or under a
 * token that has since been replaced, is this era's own constraint broken
 * inside its own settings panel: the surface would be showing something that
 * does not match, which is a lie about a machine.
 *
 * Every input the answer depends on is checked, not just the visible one, and
 * invalidated by observation at the read rather than cleared by an effect. The
 * change that makes the answer stale and the render that would show it are the
 * same beat, and a result that arrives after such a change is stale on arrival
 * — carrying its provenance inside the answer settles both without a race.
 */
export function visibleExecutionHostConnectionResult(input: {
  attempt: ExecutionHostConnectionAttempt | null
  baseUrl: string
  tokenGeneration: number
}): RemoteExecutionHostConnectionResult | null {
  if (!input.attempt || input.attempt.baseUrl === null) return null
  if (input.attempt.tokenGeneration !== input.tokenGeneration) return null
  const typed = normalizeExecutionHostBaseUrl(input.baseUrl)
  if (typed === null) return null
  return typed === input.attempt.baseUrl ? input.attempt.result : null
}

/**
 * What Settings says when the environment override serves nobody (MAR-2642).
 *
 * `CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN` predates Endpoints and names no
 * machine, so it answers for exactly one id — the one the single-host era
 * became. Add always mints a fresh id and never that one, so a machine added
 * after the original was removed cannot silently inherit its credential. That
 * is the right refusal, and it leaves the override set and doing nothing.
 *
 * A dead credential nobody mentions is precisely the invisible state this era
 * exists to stop, so the consequence is said out loud rather than left for the
 * user to deduce from a daemon that will not authenticate.
 *
 * Priced against the stored Endpoints rather than the drafts on screen: the
 * override answers for what is saved, and a row typed but not yet saved does
 * not carry its id yet.
 */
export function describeOrphanedExecutionHostEnvironmentOverride(input: {
  override: ExecutionHostDaemonEnvironmentOverride | null
  savedEndpoints: readonly { id: string }[]
}): string | null {
  const override = input.override
  if (!override?.configured) return null
  const served = input.savedEndpoints.some(
    (endpoint) => endpoint.id === override.endpointId,
  )
  if (served) return null
  return (
    `${override.envKey} is set, but no endpoint carries the id ` +
    `\u201C${override.endpointId}\u201D that it serves, so it authenticates nothing. ` +
    'Paste the token into the endpoint that needs it, or unset the variable.'
  )
}
