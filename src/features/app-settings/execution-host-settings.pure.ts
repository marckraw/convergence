import {
  DEFAULT_EXECUTION_HOST_ENDPOINT_ID,
  type ExecutionHostEndpoint,
} from '@/entities/execution-host'

/** One Endpoint as the settings form is currently holding it. */
export interface ExecutionHostEndpointDraft {
  id: string
  label: string
  baseUrl: string
}

/** What a row calls itself before it has been named. */
export const UNNAMED_EXECUTION_HOST_ENDPOINT_LABEL = 'Unnamed endpoint'

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

/** How a row refers to itself in buttons, warnings and labels. */
export function executionHostEndpointDisplayName(
  draft: Pick<ExecutionHostEndpointDraft, 'label'>,
): string {
  return draft.label.trim() || UNNAMED_EXECUTION_HOST_ENDPOINT_LABEL
}

/**
 * The id a newly added Endpoint takes (MAR-2642).
 *
 * `'default'` first, when no row already holds it. Two things are keyed by that
 * exact id and by nothing else: the Keychain account the single-host era
 * already wrote a token to, and `CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN`,
 * which serves `'default'` and refuses every other Endpoint on purpose. Minting
 * a fresh id for the first Endpoint on a machine that has one of those would
 * leave it silently unreachable — an environment token set and never consulted.
 * Every Endpoint after the first gets a minted id, because two machines must
 * never share one Keychain account.
 */
export function nextExecutionHostEndpointId(
  drafts: readonly ExecutionHostEndpointDraft[],
  mintId: () => string,
): string {
  const taken = new Set(drafts.map((draft) => draft.id))
  if (!taken.has(DEFAULT_EXECUTION_HOST_ENDPOINT_ID)) {
    return DEFAULT_EXECUTION_HOST_ENDPOINT_ID
  }
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
 * What removing an Endpoint costs, or null when it costs nothing (MAR-2642).
 *
 * Slice 1 made a session whose Endpoint is gone refuse to run rather than
 * silently move to another machine, so a removal is never free once anything
 * names it. An unknown count is a cost too: presenting a removal as free
 * because Convergence failed to count would be the lie this era exists to
 * prevent.
 */
export function describeExecutionHostEndpointRemoval(input: {
  label: string
  sessionCount: number | null
}): string | null {
  const name = executionHostEndpointDisplayName({ label: input.label })
  if (input.sessionCount === null) {
    return (
      `Convergence could not count the sessions that run on “${name}”. ` +
      'Any session that names it will refuse to run once it is gone.'
    )
  }
  if (input.sessionCount <= 0) return null
  const sessions =
    input.sessionCount === 1
      ? '1 session runs'
      : `${input.sessionCount} sessions run`
  return (
    `${sessions} on “${name}”. Removing it does not move them — they will ` +
    'refuse to run, because a session may only run on the machine it named.'
  )
}
