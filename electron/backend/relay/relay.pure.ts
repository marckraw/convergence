import type {
  RelayAction,
  RelayHopOutcome,
  RelaySpawnSpec,
  RelayTrigger,
} from './relay.types'

/** Ledger previews are a glance, not a transcript. */
export const RELAY_PAYLOAD_PREVIEW_LENGTH = 500

/**
 * How many hops one flow run may fire before the guard trips.
 *
 * Loops are legal and wanted -- A -> B -> A is our own review loop -- so the
 * guard is a budget rather than a ban. Twenty is generous enough that no
 * honest loop reaches it and small enough that a runaway costs pocket change.
 */
export const MAX_AUTOMATIC_HOPS_PER_FLOW_RUN = 20

/** Outcomes that actually consumed a provider turn, and so consume budget. */
const BUDGETED_OUTCOMES: readonly RelayHopOutcome[] = [
  'delivered',
  'queued',
  'spawned',
]

/**
 * Takes a plain string because it reads stored rows, which may carry an
 * outcome word from another build. An unrecognised word charges nothing: the
 * budget exists to stop live loops, and a row this build cannot read is not
 * evidence that a provider turn was spent.
 */
export function isBudgetedOutcome(outcome: string): boolean {
  return (BUDGETED_OUTCOMES as readonly string[]).includes(outcome)
}

export function normalizeRelayTrigger(value: string): RelayTrigger {
  if (value !== 'settled') {
    throw new Error(`Unknown relay trigger: ${value}`)
  }
  return value
}

export function normalizeRelayAction(value: string): RelayAction {
  if (value !== 'hail' && value !== 'spawn') {
    throw new Error(`Unknown relay action: ${value}`)
  }
  return value
}

const MAX_SPAWN_NAME_LENGTH = 120

/**
 * Validates the session a spawn relay will open. Provider is required because
 * "start a session" with no provider is not a wire, it is a wish.
 */
export function normalizeRelaySpawnSpec(
  spec: RelaySpawnSpec | null | undefined,
): RelaySpawnSpec {
  if (!spec) {
    throw new Error('A spawn relay needs a session spec')
  }

  const providerId = spec.providerId?.trim() ?? ''
  if (!providerId) {
    throw new Error('A spawn relay needs a provider')
  }

  const projectId = spec.projectId?.trim() ? spec.projectId.trim() : null
  const name = spec.name?.trim() ? spec.name.trim() : DEFAULT_SPAWN_NAME
  if (name.length > MAX_SPAWN_NAME_LENGTH) {
    throw new Error(
      `Spawned session name cannot be longer than ${MAX_SPAWN_NAME_LENGTH} characters`,
    )
  }

  return {
    projectId,
    providerId,
    model: spec.model?.trim() ? spec.model.trim() : null,
    effort: spec.effort?.trim() ? spec.effort.trim() : null,
    name,
  }
}

/** What a spawned session is called when the wire did not name one. */
export const DEFAULT_SPAWN_NAME = 'Relayed session'

export function normalizeRelaySessionId(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`Relay ${label} cannot be empty`)
  }
  return trimmed
}

export function normalizeRelayCrewId(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error('Relay crew cannot be empty')
  }
  return trimmed
}

/**
 * Validates a wire before it is stored. A relay pointing at its own source
 * would fire itself forever with no second agent involved, which is a typo
 * rather than a loop -- real loops run through at least two sessions.
 */
export function assertRelayEndpoints(
  sourceSessionId: string,
  targetSessionId: string | null,
  action: RelayAction,
): void {
  if (action === 'hail' && !targetSessionId) {
    throw new Error('A hail relay needs a target session')
  }
  // A spawn opens its own far end every time it fires, so a stored target
  // would be a second, contradictory answer to "where does this go".
  if (action === 'spawn' && targetSessionId) {
    throw new Error('A spawn relay cannot also have a target session')
  }
  if (targetSessionId && targetSessionId === sourceSessionId) {
    throw new Error('A relay cannot hail the session it listens to')
  }
}

/**
 * The ledger's glance at what was carried. Collapses whitespace so a preview
 * stays one readable line in a dense trail.
 */
export function buildPayloadPreview(text: string | null): string | null {
  if (text === null) return null
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0) return null
  return collapsed.length > RELAY_PAYLOAD_PREVIEW_LENGTH
    ? `${collapsed.slice(0, RELAY_PAYLOAD_PREVIEW_LENGTH - 1)}…`
    : collapsed
}

/**
 * Whether a firing is allowed to spend another hop on this flow run.
 */
export function hasFlowRunBudget(spentHops: number): boolean {
  return spentHops < MAX_AUTOMATIC_HOPS_PER_FLOW_RUN
}

/**
 * The sentence the ledger shows when the guard trips. It names the number so
 * the disarm never looks arbitrary.
 */
export function flowRunBudgetMessage(spentHops: number): string {
  return `This flow run already fired ${spentHops} hops, hitting the ${MAX_AUTOMATIC_HOPS_PER_FLOW_RUN}-hop budget. The relay was disarmed to stop the loop.`
}
