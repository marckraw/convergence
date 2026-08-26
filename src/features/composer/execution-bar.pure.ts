import {
  executionHostEndpointDisplayName,
  isLocalExecutionHost,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostEndpoint,
} from '@/entities/execution-host'

/**
 * Providers the remote agents daemon can run. Mirrors the backend mapping in
 * electron/backend/provider/execution-host/remote-execution-host.pure.ts —
 * keep the two lists in sync.
 */
const REMOTE_CAPABLE_PROVIDER_IDS = new Set(['claude-code', 'codex', 'cursor'])

/** What this machine is called in the strip. */
export const LOCAL_EXECUTION_HOST_LABEL = 'Local'

/** What a session names when the Endpoint it named is gone. */
export const REMOVED_EXECUTION_HOST_LABEL = 'Removed endpoint'

const REMOVED_ENDPOINT_WARNING =
  'This session names an endpoint that is no longer configured, so it will ' +
  'refuse to run.'

/** One machine the strip offers, and whether it can be picked right now. */
export interface ExecutionHostChoice {
  /** `'local'`, or an Endpoint id. Never a boolean and never `'remote'`. */
  id: string
  label: string
  /** Why this machine cannot be picked right now, or null when it can. */
  blockedReason: string | null
}

/**
 * The Execution Bar as one value (MAR-2642).
 *
 * Every variant carries `hostId` — the machine the session will be, or already
 * is, born on. That is not decoration: the strip and the two call sites that
 * *send* the choice (the session it creates, and the provider account it
 * refuses to attach) all read this one field, so the strip cannot name one
 * machine while the session goes to another. A shape where only the visible
 * variant carried the id would let the hidden and settled states be answered
 * from somewhere else, and somewhere else is where they would drift.
 */
export type ExecutionBarView =
  | { mode: 'hidden'; hostId: string }
  | {
      mode: 'choosing'
      hostId: string
      choices: readonly ExecutionHostChoice[]
    }
  | { mode: 'settled'; hostId: string; label: string; warning: string | null }

/**
 * Why a session on this provider cannot leave this machine, or null.
 *
 * The daemon runs a fixed set of provider CLIs. Picking a machine that cannot
 * run the selected provider would be a strip promising something the backend
 * refuses, so those rows are listed and blocked rather than silently dropped —
 * the row vanishing as he changes provider would leave him hunting for a
 * machine he configured, with no statement of why it went.
 */
export function describeRemoteExecutionBlock(input: {
  providerId: string
  providerLabel: string
}): string | null {
  if (REMOTE_CAPABLE_PROVIDER_IDS.has(input.providerId)) return null
  return `${input.providerLabel} has no counterpart on the agents daemon, so it can only run here.`
}

export interface ExecutionBarInput {
  endpoints: readonly ExecutionHostEndpoint[]
  /** The live session's own host, or null while a session is being born. */
  liveSessionHostId: string | null | undefined
  providerId: string
  providerLabel: string
  contextKind: 'project' | 'global'
  /** The last machine he picked. Honoured only while it is still pickable. */
  selectedHostId: string
}

/**
 * What the strip beneath the composer shows, and where the session will run
 * (MAR-2642).
 *
 * Two readings of one tier. While a session is being born the strip is a
 * chooser; once it is live it is a statement of fact, because the daemon owns
 * the run and the machine cannot change under it.
 *
 * The pick is clamped here at the read rather than corrected by an effect. An
 * Endpoint can be removed in Settings, and a provider swap can make a
 * perfectly good Endpoint unable to run the session, while a stale pick sits
 * in component state; resolving on every render means the change that
 * invalidates the pick and the render that would have shown it are the same
 * beat. The raw pick is left alone, so switching back to a daemon-capable
 * provider restores the machine he chose instead of quietly demoting him to
 * local for the rest of the session.
 */
export function resolveExecutionBarView(
  input: ExecutionBarInput,
): ExecutionBarView {
  const live = input.liveSessionHostId ?? null
  const liveHostId = live === null ? null : normalizeHostId(live)

  // A global session has no repository to materialize, so it has only ever run
  // here and can only ever run here. A tier that can neither choose nor report
  // anything is noise.
  if (input.contextKind === 'global') {
    return { mode: 'hidden', hostId: liveHostId ?? LOCAL_EXECUTION_HOST_ID }
  }

  if (liveHostId !== null) return settledView(liveHostId, input.endpoints)

  // Ruled by Fable: a chooser offering one choice is an empty promise. With no
  // Endpoint configured the composer looks exactly as it did before this slice.
  if (input.endpoints.length === 0) {
    return { mode: 'hidden', hostId: LOCAL_EXECUTION_HOST_ID }
  }

  const blockedReason = describeRemoteExecutionBlock(input)
  const choices: ExecutionHostChoice[] = [
    {
      id: LOCAL_EXECUTION_HOST_ID,
      label: LOCAL_EXECUTION_HOST_LABEL,
      blockedReason: null,
    },
    ...input.endpoints.map((endpoint) => ({
      id: endpoint.id,
      label: executionHostEndpointDisplayName(endpoint),
      blockedReason,
    })),
  ]

  const picked = choices.find(
    (choice) => choice.id === normalizeHostId(input.selectedHostId),
  )
  return {
    mode: 'choosing',
    hostId:
      picked && !picked.blockedReason ? picked.id : LOCAL_EXECUTION_HOST_ID,
    choices,
  }
}

/**
 * A live session's machine, named (MAR-2642).
 *
 * Hidden only for a local session on a machine that has no Endpoints at all —
 * there is nothing it could be mistaken for. A local session *does* get the
 * tier once Endpoints exist, because with several machines available "this one
 * ran here" stops being obvious. A remote session always gets it, Endpoints
 * configured or not: removing every Endpoint does not move the session, and
 * that is exactly the moment the fact is worth saying.
 */
function settledView(
  hostId: string,
  endpoints: readonly ExecutionHostEndpoint[],
): ExecutionBarView {
  if (isLocalExecutionHost(hostId)) {
    if (endpoints.length === 0) return { mode: 'hidden', hostId }
    return {
      mode: 'settled',
      hostId,
      label: LOCAL_EXECUTION_HOST_LABEL,
      warning: null,
    }
  }

  const endpoint = endpoints.find((candidate) => candidate.id === hostId)
  if (!endpoint) {
    return {
      mode: 'settled',
      hostId,
      label: REMOVED_EXECUTION_HOST_LABEL,
      warning: REMOVED_ENDPOINT_WARNING,
    }
  }
  return {
    mode: 'settled',
    hostId,
    label: executionHostEndpointDisplayName(endpoint),
    warning: null,
  }
}

/** Blank and whitespace mean this machine, the way every pre-remote row did. */
function normalizeHostId(hostId: string): string {
  return hostId.trim() || LOCAL_EXECUTION_HOST_ID
}

/**
 * The Endpoint id a new session records, or undefined for this machine.
 *
 * Local stays absent on the wire rather than becoming the literal `'local'`:
 * every session written before Endpoints existed has no `executionHost` at
 * all, and one meaning must not gain a second encoding.
 */
export function executionHostForNewSession(
  view: ExecutionBarView,
): string | undefined {
  return isLocalExecutionHost(view.hostId) ? undefined : view.hostId
}
