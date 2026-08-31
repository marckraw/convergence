import {
  executionHostEndpointDisplayName,
  isLocalExecutionHost,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostEndpoint,
} from '@/entities/execution-host'

/** What this machine is called in the strip. */
export const LOCAL_EXECUTION_HOST_LABEL = 'Local'

/**
 * What a session names when the Endpoint it named is gone (MAR-2642).
 *
 * The id is in the label because this is the state where naming the machine
 * matters most: the session will refuse to run, and two removed endpoints are
 * one indistinguishable "Removed endpoint" unless it says which one it named.
 * The id is the honest fallback, not the right answer — a session records only
 * the endpoint id, so the name he gave the machine dies with the settings row
 * (MAR-2662 records the display name at start).
 */
function removedExecutionHostLabel(endpointId: string): string {
  return `Removed endpoint (${endpointId})`
}

function removedEndpointWarning(endpointId: string): string {
  return (
    `This session names "${endpointId}", an endpoint that is no longer ` +
    'configured, so it will refuse to run.'
  )
}

/**
 * One machine the strip offers (MAR-2642).
 *
 * Every configured Endpoint is offered, unconditionally. Until S3 a choice
 * could be blocked by the provider selected above it, from a local table that
 * had never asked any daemon what it runs; that arrow now points the other way
 * -- the machine is picked, and the option row is filled from what *it* says
 * (MAR-2682, "nothing local may assert a remote fact"). So nothing local
 * decides here.
 */
export interface ExecutionHostChoice {
  /** `'local'`, or an Endpoint id. Never a boolean and never `'remote'`. */
  id: string
  label: string
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

export interface ExecutionBarInput {
  endpoints: readonly ExecutionHostEndpoint[]
  /** The live session's own host, or null while a session is being born. */
  liveSessionHostId: string | null | undefined
  contextKind: 'project' | 'global'
  /** The last machine he picked. Honoured only while it is still configured. */
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
 * Endpoint can be removed in Settings while a stale pick sits in component
 * state; resolving on every render means the change that invalidates the pick
 * and the render that would have shown it are the same beat. The raw pick is
 * left alone, so adding the Endpoint back restores the machine he chose
 * instead of quietly demoting him to local for the rest of the session.
 */
export function resolveExecutionBarView(
  input: ExecutionBarInput,
): ExecutionBarView {
  const live = input.liveSessionHostId ?? null
  // A *record*, read the way the backend reads the same record. Blank and
  // whitespace mean this machine, the way every pre-Endpoint row does, and
  // `isLocalExecutionHost` is where that rule lives -- the strip used to keep a
  // private copy of it, which is a rule in two places and therefore a rule that
  // can drift. It must not: the strip that said "not Local" for a session the
  // backend runs locally would be the strip lying about where the run goes
  // (MAR-2682). A value that names no machine here (` kuba `) is left exactly
  // as recorded, and says so below in the words for a machine that is gone.
  const liveHostId =
    live === null
      ? null
      : isLocalExecutionHost(live)
        ? LOCAL_EXECUTION_HOST_ID
        : live

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

  const choices: ExecutionHostChoice[] = [
    { id: LOCAL_EXECUTION_HOST_ID, label: LOCAL_EXECUTION_HOST_LABEL },
    ...input.endpoints.map((endpoint) => ({
      id: endpoint.id,
      label: executionHostEndpointDisplayName(endpoint),
    })),
  ]

  // The pick is a chooser id, never a record: it is one of the ids offered
  // above, or a stale one that no longer is. So it is compared as it stands,
  // and anything that matches no choice falls back to this machine on the line
  // below -- which is where a blank pick ended up anyway.
  const picked = choices.find((choice) => choice.id === input.selectedHostId)
  return {
    mode: 'choosing',
    hostId: picked ? picked.id : LOCAL_EXECUTION_HOST_ID,
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
      label: removedExecutionHostLabel(hostId),
      warning: removedEndpointWarning(hostId),
    }
  }
  return {
    mode: 'settled',
    hostId,
    label: executionHostEndpointDisplayName(endpoint),
    warning: null,
  }
}

/**
 * The permission preset a session being born on this machine starts with
 * (MAR-2689).
 *
 * `yolo` on a remote, ruled by Marcin: *"he is not there to click allow."* A
 * run on a daemon is unattended by definition — the composer that would show
 * the approval is on a laptop that may be shut, and a session parked on an
 * approval nobody sees is a run that quietly does nothing for hours.
 *
 * Local keeps `ask`, unchanged and not merely equal: this is the default a
 * local composer has always opened with, and the machine tier must not change
 * anything about a Local session (MAR-2682).
 *
 * A default, never an override. The composer applies it only while he has not
 * touched the preset himself; his touch survives every machine switch after it,
 * because a default that undid a deliberate choice would be the control below
 * the strip disagreeing with the human above it.
 */
export function defaultPermissionPresetForHost(hostId: string): 'ask' | 'yolo' {
  return isLocalExecutionHost(hostId) ? 'ask' : 'yolo'
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
