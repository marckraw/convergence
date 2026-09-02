import type { RelayAction, SessionRelay } from '@/entities/session-relay'

/** The two halves of a trigger clause, wrapped around the source session. */
export interface RelayTriggerClause {
  /** Sits before the session name: "When". */
  prefix: string
  /** Sits after it: "finishes". */
  suffix: string
}

/**
 * How each trigger reads in a sentence.
 *
 * A `Record` keyed by the union, so a trigger added to the type cannot ship
 * without words — the compiler asks for them here, once, instead of leaving
 * three files quietly saying "finishes" about a wire that fires on something
 * else. This is the seam the action clause already had (see `connector`); the
 * trigger simply never needed one while there was only one of them.
 */
export const RELAY_TRIGGER_CLAUSES: Record<
  SessionRelay['trigger'],
  RelayTriggerClause
> = {
  settled: { prefix: 'When', suffix: 'finishes' },
}

/** What the sentence calls an endpoint whose session is gone. */
export const MISSING_SESSION_LABEL = 'a session that no longer exists'

export interface RelayEndpointLabel {
  sessionId: string
  name: string
  /** The session was deleted out from under the wire. */
  missing: boolean
}

export interface RelaySentence {
  /** What makes this wire fire, in words wrapped around the source name. */
  trigger: RelayTriggerClause
  source: RelayEndpointLabel
  /** The phrase between the two ends — what this wire actually does. */
  connector: string
  target: RelayEndpointLabel
  /** Trailing specifics for a spawn: which provider, which project. */
  detail: string | null
  /**
   * Set when the wire carries a standing brief. Quiet by design: the sentence
   * says the wire has instructions, and the instructions themselves live in
   * the form — a paragraph inlined into every row would bury the wiring the
   * row exists to show.
   */
  instruction: string | null
  /**
   * Set when the wire opens with a first send. The literal text, truncated:
   * "sends something first" would leave the user guessing at the one word
   * that decides whether the target gets wiped.
   */
  opener: string | null
  /**
   * The route this wire waits for, verbatim, or null when it fires on any
   * finish. Quoted rather than summarised: the token IS the line the agent
   * writes, and paraphrasing it would hide the one string that has to match.
   */
  condition: string | null
  /** The whole sentence as plain text, for titles and accessible names. */
  text: string
}

/** The quiet marker a briefed wire wears in its sentence. */
export const RELAY_INSTRUCTION_MARKER = 'with instructions'

/**
 * How the sentence opens for a wire that waits for a declared route.
 *
 * In front of the trigger rather than trailing behind it, because it changes
 * WHEN the wire fires, and a condition read after "send its last message to"
 * would be read as a condition on the delivery.
 */
export function relayConditionMarker(conditionToken: string): string {
  return `Only if it ends with "${conditionToken.trim()}", `
}

/**
 * How much of the opener the sentence quotes. A row is scanned, and an opener
 * is usually one word -- anything longer is hinted at and read in full on
 * hover, the same bargain the instruction marker makes.
 */
export const RELAY_OPENER_MARKER_LENGTH = 24

/** The marker an opening wire wears: the literal first send, in words. */
export function relayOpenerMarker(opener: string): string {
  const collapsed = opener.replace(/\s+/g, ' ').trim()
  const quoted =
    collapsed.length > RELAY_OPENER_MARKER_LENGTH
      ? `${collapsed.slice(0, RELAY_OPENER_MARKER_LENGTH - 1)}…`
      : collapsed
  return `sends ${quoted} first`
}

export type ResolveSessionName = (sessionId: string) => string | null

function endpoint(
  sessionId: string | null,
  resolveName: ResolveSessionName,
): RelayEndpointLabel {
  if (!sessionId) {
    return { sessionId: '', name: MISSING_SESSION_LABEL, missing: true }
  }
  const name = resolveName(sessionId)
  return name
    ? { sessionId, name, missing: false }
    : { sessionId, name: MISSING_SESSION_LABEL, missing: true }
}

/**
 * A relay as an honest sentence.
 *
 * The wire says exactly what it will do and to whom, in the order it happens.
 * No jargon: a user reading their crew should never have to hold a mental model
 * of triggers and actions to know what is armed.
 */
export function buildRelaySentence(
  relay: Pick<
    SessionRelay,
    | 'trigger'
    | 'sourceSessionId'
    | 'targetSessionId'
    | 'action'
    | 'spawnSpec'
    | 'instruction'
    | 'opener'
    | 'conditionToken'
  >,
  resolveName: ResolveSessionName,
  resolveProjectName?: (projectId: string | null) => string,
  /**
   * Names an explicitly chosen account. Only consulted when the wire named
   * one: a spec that leaves it null rides whatever the enrolled default is at
   * firing time, and printing today's default would be a promise the wire has
   * not made.
   */
  resolveAccountLabel?: (accountId: string) => string | null,
): RelaySentence {
  const source = endpoint(relay.sourceSessionId, resolveName)
  const trigger = RELAY_TRIGGER_CLAUSES[relay.trigger]
  const condition = relay.conditionToken?.trim() ? relay.conditionToken : null
  const opening = condition
    ? `${relayConditionMarker(condition)}${trigger.prefix.toLowerCase()} ${source.name} ${trigger.suffix}`
    : `${trigger.prefix} ${source.name} ${trigger.suffix}`
  const instruction = relay.instruction?.trim() ? relay.instruction : null
  // Only a hail can open with a first send: a spawn's far end is a session
  // that did not exist a moment ago, so there is nothing to clear.
  const opener =
    relay.action === 'hail' && relay.opener?.trim() ? relay.opener : null
  // In the order they happen: the opener goes first, then the brief rides
  // above the message.
  const marker =
    (opener ? ` · ${relayOpenerMarker(opener)}` : '') +
    (instruction ? ` · ${RELAY_INSTRUCTION_MARKER}` : '')

  if (relay.action === 'spawn') {
    const spec = relay.spawnSpec
    const connector = 'start a new session called'

    if (!spec) {
      const target: RelayEndpointLabel = {
        sessionId: '',
        name: 'a session this wire never described',
        missing: true,
      }
      return {
        trigger,
        source,
        connector,
        target,
        detail: null,
        instruction,
        opener,
        condition,
        text: `${opening}, ${connector} ${target.name}${marker}`,
      }
    }

    const where = resolveProjectName?.(spec.projectId) ?? 'a project'
    const target: RelayEndpointLabel = {
      sessionId: '',
      name: spec.name,
      missing: false,
    }
    const accountLabel = spec.providerAccountId
      ? (resolveAccountLabel?.(spec.providerAccountId) ??
        'an account that is gone')
      : null
    const detail = accountLabel
      ? `${spec.providerId} in ${where} · as ${accountLabel}`
      : `${spec.providerId} in ${where}`

    return {
      trigger,
      source,
      connector,
      target,
      detail,
      instruction,
      opener,
      condition,
      text: `${opening}, ${connector} ${target.name} — ${detail}${marker}`,
    }
  }

  const connector = 'send its last message to'
  const target = endpoint(relay.targetSessionId, resolveName)
  return {
    trigger,
    source,
    connector,
    target,
    detail: null,
    instruction,
    opener,
    condition,
    text: `${opening}, ${connector} ${target.name}${marker}`,
  }
}

export interface RelayEndpointOption {
  id: string
  label: string
  description?: string
}

/**
 * The sessions a wire in this crew may connect. Relays live inside a crew, so
 * both ends are picked from its members and nowhere else -- cross-crew wires
 * do not exist.
 */
export function buildRelayEndpointOptions(
  sessionIds: readonly string[],
  resolveName: ResolveSessionName,
  resolveDescription?: (sessionId: string) => string | undefined,
): RelayEndpointOption[] {
  return sessionIds
    .filter((sessionId) => resolveName(sessionId) !== null)
    .map((sessionId) => {
      const description = resolveDescription?.(sessionId)
      return {
        id: sessionId,
        label: resolveName(sessionId) as string,
        ...(description ? { description } : {}),
      }
    })
}

export interface RelaySpawnDraft {
  /** Null means a global session, not tied to any project. */
  projectId: string | null
  providerId: string | null
  model: string | null
  effort: string | null
  name: string
  /** Null means the enrolled default for the provider, chosen when it fires. */
  providerAccountId: string | null
}

export interface RelayDraft {
  action: RelayAction
  sourceSessionId: string | null
  targetSessionId: string | null
  /** Raw textarea text; empty means the wire carries the message untouched. */
  instruction: string
  /** Raw field text; empty means the payload is delivered straight away. */
  opener: string
  /** Raw field text; empty means the wire fires on any finish. */
  conditionToken: string
  spawn: RelaySpawnDraft
}

export const EMPTY_SPAWN_DRAFT: RelaySpawnDraft = {
  projectId: null,
  providerId: null,
  model: null,
  effort: null,
  name: '',
  providerAccountId: null,
}

export const EMPTY_RELAY_DRAFT: RelayDraft = {
  action: 'hail',
  sourceSessionId: null,
  targetSessionId: null,
  instruction: '',
  opener: '',
  conditionToken: '',
  spawn: EMPTY_SPAWN_DRAFT,
}

/**
 * Two spawn wires off the same session with the same spec would open two
 * identical sessions on every finish, which is a slip rather than an
 * intention. Model and name are excluded: those are the parts a user
 * legitimately varies between two otherwise-alike spawns.
 */
function isDuplicateSpawn(draft: RelayDraft, relay: SessionRelay): boolean {
  return (
    relay.action === 'spawn' &&
    relay.sourceSessionId === draft.sourceSessionId &&
    relay.spawnSpec?.providerId === draft.spawn.providerId &&
    (relay.spawnSpec?.projectId ?? null) === draft.spawn.projectId
  )
}

/**
 * Why this draft cannot be saved yet, in the words the user needs, or null
 * when it is ready. The backend enforces the same rules -- this exists so the
 * Save button can explain itself before a round trip, never instead of one.
 */
export function relayDraftProblem(
  draft: RelayDraft,
  existingRelays: readonly SessionRelay[],
  editingRelayId?: string | null,
): string | null {
  if (!draft.sourceSessionId) {
    return 'Pick the session that finishes.'
  }

  const others = existingRelays.filter((relay) => relay.id !== editingRelayId)

  if (draft.action === 'spawn') {
    if (!draft.spawn.providerId) {
      return 'Pick the provider for the new session.'
    }
    if (others.some((relay) => isDuplicateSpawn(draft, relay))) {
      return 'This crew already starts that session here.'
    }
    return null
  }

  if (!draft.targetSessionId) {
    return 'Pick the session that receives its last message.'
  }
  if (draft.sourceSessionId === draft.targetSessionId) {
    return 'A relay cannot hail the session it listens to.'
  }
  if (
    others.some(
      (relay) =>
        relay.action === 'hail' &&
        relay.sourceSessionId === draft.sourceSessionId &&
        relay.targetSessionId === draft.targetSessionId,
    )
  ) {
    return 'This crew already has that wire.'
  }

  return null
}

export function isSavableRelayDraft(
  draft: RelayDraft,
  existingRelays: readonly SessionRelay[],
  editingRelayId?: string | null,
): boolean {
  return relayDraftProblem(draft, existingRelays, editingRelayId) === null
}

export function formatRelayCount(count: number): string {
  return `${count} relay${count === 1 ? '' : 's'}`
}

/** The armed toggle's own sentence, so the switch is never a mystery. */
export function formatArmedLabel(armed: boolean): string {
  return armed ? 'Armed' : 'Disarmed'
}
