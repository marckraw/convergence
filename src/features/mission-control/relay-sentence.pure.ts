import type { RelayAction, SessionRelay } from '@/entities/session-relay'

/** What the sentence calls an endpoint whose session is gone. */
export const MISSING_SESSION_LABEL = 'a session that no longer exists'

export interface RelayEndpointLabel {
  sessionId: string
  name: string
  /** The session was deleted out from under the wire. */
  missing: boolean
}

export interface RelaySentence {
  source: RelayEndpointLabel
  /** The phrase between the two ends — what this wire actually does. */
  connector: string
  target: RelayEndpointLabel
  /** Trailing specifics for a spawn: which provider, which project. */
  detail: string | null
  /** The whole sentence as plain text, for titles and accessible names. */
  text: string
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
    'sourceSessionId' | 'targetSessionId' | 'action' | 'spawnSpec'
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
        source,
        connector,
        target,
        detail: null,
        text: `When ${source.name} finishes, ${connector} ${target.name}`,
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
      source,
      connector,
      target,
      detail,
      text: `When ${source.name} finishes, ${connector} ${target.name} — ${detail}`,
    }
  }

  const connector = 'send its last message to'
  const target = endpoint(relay.targetSessionId, resolveName)
  return {
    source,
    connector,
    target,
    detail: null,
    text: `When ${source.name} finishes, ${connector} ${target.name}`,
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
