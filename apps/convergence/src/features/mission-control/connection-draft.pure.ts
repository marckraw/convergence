import type {
  CreateSessionRelayInput,
  RelaySpawnSpec,
  SessionRelay,
  UpdateSessionRelayInput,
} from '@/entities/session-relay'
import { batonConditionToken } from './crew-loop.pure'

/**
 * The message that starts a provider's conversation over.
 *
 * Claude's word, and plain text on the wire by design: the engine sends an
 * opener verbatim and never reads it, so its meaning belongs to whoever
 * receives it. A provider that gains its own reset word gets its own constant
 * rather than inheriting this one.
 *
 * Duplicated NOWHERE. The engine has no literal to agree with — it carries
 * `session_relays.opener` byte for byte — so this is the only place in the
 * app that knows what "clear the conversation" is spelled as.
 */
export const CONVERSATION_RESET_COMMAND = '/clear'

/**
 * What happens to the recipient's conversation before this connection's
 * message lands (R8).
 *
 * Three named choices over one stored column (`session_relays.opener`), which
 * is why this is a derivation rather than a field: `keep` is no opener,
 * `clear` is the reset command, and `custom` is any other first message. The
 * free opener that existed before this selector is therefore not lost — it is
 * the third choice, spelled out.
 */
export type BeforeDeliveryMode = 'keep' | 'clear' | 'custom'

/** Where a connection's message goes: a conversation, or one it will open. */
export type ConnectionRecipient =
  | { kind: 'session'; sessionId: string | null }
  | { kind: 'spawn'; spec: ConnectionSpawnSpec }

export interface ConnectionSpawnSpec {
  projectId: string | null
  providerId: string | null
  model: string | null
  effort: string | null
  name: string
  providerAccountId: string | null
}

/** When a connection fires: on any finish, or only on a declared route. */
export type ConnectionCondition =
  | { kind: 'any' }
  | { kind: 'token'; token: string }

/**
 * One connection, as the inspector holds it while it is being edited.
 *
 * Deliberately not the stored row's shape. The row keeps one nullable
 * `opener` and one nullable `conditionToken` because that is what the engine
 * reads; the inspector holds named choices because that is what a person
 * picks, and `custom` has to keep its text while `keep` is selected or
 * switching back and forth would throw away what they typed.
 */
export interface ConnectionDraft {
  sourceSessionId: string
  recipient: ConnectionRecipient
  enabled: boolean
  condition: ConnectionCondition
  beforeDelivery: BeforeDeliveryMode
  /** Kept across a mode change, so toggling away and back loses nothing. */
  customOpener: string
  instructions: string
}

export const EMPTY_SPAWN_SPEC: ConnectionSpawnSpec = {
  projectId: null,
  providerId: null,
  model: null,
  effort: null,
  name: '',
  providerAccountId: null,
}

/**
 * A connection drawn but not yet saved.
 *
 * Off by default: saving a connection does not authorize the next settle
 * to deliver through it. The person arms it explicitly with the toggle.
 */
export function newConnectionDraft(input: {
  sourceSessionId: string
  targetSessionId?: string | null
  /** The recipient's baton name, when the crew has given it one. */
  suggestedBatonName?: string | null
}): ConnectionDraft {
  return {
    sourceSessionId: input.sourceSessionId,
    recipient: { kind: 'session', sessionId: input.targetSessionId ?? null },
    enabled: false,
    // Pre-filled from the recipient's baton name when there is one, because
    // the convention only works if the line the wire waits for and the line
    // the station is told to write are one string. Unconditional otherwise:
    // `BATON: ` with nothing after it is a condition that can never match.
    condition: input.suggestedBatonName
      ? { kind: 'token', token: batonConditionToken(input.suggestedBatonName) }
      : { kind: 'any' },
    beforeDelivery: 'keep',
    customOpener: '',
    instructions: '',
  }
}

/**
 * The stored wire, read back into the shape the inspector edits.
 *
 * `supportsReset` decides how a stored `/clear` reads, and that is the whole
 * of R8's compatibility promise: on a provider that can reset, it is the
 * *Clear the conversation first* choice; on one that cannot, it stays a
 * CUSTOM first message with its text intact. Nothing an older build stored is
 * lost or silently reinterpreted into a control that does not work.
 */
export function draftFromRelay(
  relay: SessionRelay,
  options: { supportsReset: boolean },
): ConnectionDraft {
  const opener = relay.opener ?? ''
  const beforeDelivery: BeforeDeliveryMode =
    opener === ''
      ? 'keep'
      : opener === CONVERSATION_RESET_COMMAND && options.supportsReset
        ? 'clear'
        : 'custom'

  return {
    sourceSessionId: relay.sourceSessionId,
    recipient:
      relay.action === 'spawn'
        ? {
            kind: 'spawn',
            spec: relay.spawnSpec
              ? { ...relay.spawnSpec }
              : { ...EMPTY_SPAWN_SPEC },
          }
        : { kind: 'session', sessionId: relay.targetSessionId },
    enabled: relay.armed,
    condition:
      relay.conditionToken === null
        ? { kind: 'any' }
        : { kind: 'token', token: relay.conditionToken },
    beforeDelivery,
    // Kept even when the mode is not `custom`, so a stored `/clear` that
    // switched to *Keep context* and back is still the same text.
    customOpener: beforeDelivery === 'custom' ? opener : '',
    instructions: relay.instruction ?? '',
  }
}

/**
 * What the draft's *Before delivery* choice stores, or null for none.
 *
 * The one place the three named choices collapse back onto the single column,
 * so a mode added to the union cannot ship without an answer here.
 */
export function openerForDraft(draft: ConnectionDraft): string | null {
  switch (draft.beforeDelivery) {
    case 'keep':
      return null
    case 'clear':
      return CONVERSATION_RESET_COMMAND
    case 'custom':
      return draft.customOpener.trim() ? draft.customOpener : null
  }
}

/**
 * The draft as the two IPC inputs want it.
 *
 * Every optional field is sent as an EXPLICIT null rather than omitted, for
 * the reason the old editor did: clearing a box on an edit has to remove the
 * stored value, and an omitted field would quietly keep yesterday's.
 *
 * A spawn recipient clears the target and a session recipient clears the
 * spec, because the two arms differ in shape rather than in degree: leaving
 * the other one behind would store a wire that claims to be both.
 */
export function relayInputFromDraft(
  draft: ConnectionDraft,
): CreateSessionRelayInput & UpdateSessionRelayInput {
  const spawning = draft.recipient.kind === 'spawn'
  const spawnSpec: RelaySpawnSpec | null =
    draft.recipient.kind === 'spawn'
      ? {
          projectId: draft.recipient.spec.projectId,
          providerId: draft.recipient.spec.providerId ?? '',
          model: draft.recipient.spec.model,
          effort: draft.recipient.spec.effort,
          name: draft.recipient.spec.name.trim() || 'Relayed session',
          providerAccountId: draft.recipient.spec.providerAccountId,
        }
      : null

  return {
    crewId: '',
    sourceSessionId: draft.sourceSessionId,
    action: spawning ? 'spawn' : 'hail',
    targetSessionId:
      draft.recipient.kind === 'session' ? draft.recipient.sessionId : null,
    spawnSpec,
    instruction: draft.instructions.trim() ? draft.instructions : null,
    // A spawn opens a session that has never been used, so there is nothing
    // to reset and nothing to say first -- the selector is not offered there,
    // and an opener must not survive a recipient that switched to a spawn.
    opener: spawning ? null : openerForDraft(draft),
    conditionToken:
      draft.condition.kind === 'token' && draft.condition.token.trim()
        ? draft.condition.token
        : null,
    armed: draft.enabled,
  }
}

/**
 * The draft with a new recipient, and R8's question re-asked (M2).
 *
 * A recipient change is not a change of one field: *Before delivery* is a
 * choice about what the RECIPIENT's provider can do, so moving the wire to a
 * provider that cannot start a conversation over makes a stored `clear` a
 * setting the engine would carry as an ordinary `/clear` message. Replacing
 * the recipient alone left the panel showing *Clear the conversation first*
 * with Save enabled and stored exactly that.
 *
 * The choice is dropped rather than kept-and-refused, and the note is the
 * price of dropping it: a selection that changes itself while nobody says why
 * is the same defect wearing better manners. A custom first message is text
 * the person wrote, which every provider can receive, so it is never touched.
 */
export interface RecipientChange {
  draft: ConnectionDraft
  /** What was dropped and why, or null when nothing was. */
  note: string | null
}

export function changeDraftRecipient(
  draft: ConnectionDraft,
  recipient: ConnectionRecipient,
  options: {
    /** Whether the NEW recipient's provider can start a conversation over. */
    supportsReset: boolean
    /** The new recipient's provider, named in the note. Null when unknown. */
    providerName: string | null
  },
): RecipientChange {
  const next = { ...draft, recipient }
  // A spawn opens a session that was never used, so there is nothing to
  // reset and the selector is not offered -- the stored opener is dropped by
  // `relayInputFromDraft`, and the choice is kept here so switching back to a
  // session that CAN reset restores what they picked.
  if (recipient.kind === 'spawn') return { draft: next, note: null }
  if (draft.beforeDelivery !== 'clear' || options.supportsReset) {
    return { draft: next, note: null }
  }

  return {
    draft: { ...next, beforeDelivery: 'keep' },
    note: `${options.providerName ?? 'This provider'} cannot start a conversation over yet, so ${CONVERSATION_RESET_COMMAND} was dropped and the reply will be delivered into the conversation as it stands.`,
  }
}

/**
 * Why this draft cannot be saved yet, in the words the panel shows, or null.
 *
 * Refusals the ENGINE would make are stated here too, ahead of the trip, so
 * the person is told rather than shown a failed save: a wire that listens to
 * its own session is a loop with no second station and no human in it (R6),
 * and the same pair twice is two rows nobody could tell apart.
 *
 * `supportsReset` is a REQUIRED argument rather than an option with a
 * default, so no caller can ask whether a draft is saveable without answering
 * what its recipient can do: `clear` on a provider that cannot reset is a
 * setting the engine would carry as an ordinary message, and the fallback in
 * `changeDraftRecipient` is the door -- this is the wall behind it.
 */
export function connectionDraftProblem(
  draft: ConnectionDraft,
  existing: readonly SessionRelay[],
  editingRelayId: string | null,
  options: { supportsReset: boolean },
): string | null {
  if (!draft.sourceSessionId) return 'Pick the conversation that finishes.'

  if (draft.recipient.kind === 'spawn') {
    if (!draft.recipient.spec.providerId) {
      return 'Pick a provider for the new session.'
    }
    return null
  }

  const target = draft.recipient.sessionId
  if (!target) return 'Choose the conversation that should receive the reply.'
  if (target === draft.sourceSessionId) {
    return 'A conversation cannot answer itself — pick a different recipient.'
  }
  if (draft.beforeDelivery === 'clear' && !options.supportsReset) {
    return 'This recipient’s provider cannot start a conversation over — pick Keep context or a custom first message.'
  }

  const duplicate = existing.find(
    (relay) =>
      relay.id !== editingRelayId &&
      relay.action === 'hail' &&
      relay.sourceSessionId === draft.sourceSessionId &&
      relay.targetSessionId === target &&
      (relay.conditionToken ?? '') ===
        (draft.condition.kind === 'token' ? draft.condition.token : ''),
  )
  if (duplicate) {
    return 'These two are already connected on this condition.'
  }

  return null
}

/** What the *Before delivery* selector offers, and why one is unavailable. */
export interface BeforeDeliveryOption {
  mode: BeforeDeliveryMode
  label: string
  /** The sentence under the selector once this option is chosen. */
  help: string
  /** True when the recipient's provider cannot do it. */
  disabled: boolean
}

/**
 * The three choices, for one recipient.
 *
 * *Clear* is offered DISABLED with its reason rather than hidden when the
 * recipient's provider cannot reset: a control that vanishes teaches nothing,
 * and the person is left wondering whether Convergence forgot. Hiding it was
 * the tempting shortcut and it is the one this must not take.
 */
export function beforeDeliveryOptions(input: {
  supportsReset: boolean
  /** The recipient's provider, named in the reason. Null when unknown. */
  providerName: string | null
  /** The recipient's own name, for the sentences. Null when unknown. */
  recipientName: string | null
}): BeforeDeliveryOption[] {
  const who = input.recipientName ?? 'the recipient'
  const provider = input.providerName ?? 'This provider'

  return [
    {
      mode: 'keep',
      label: 'Keep context',
      help: `Deliver the reply into ${who}'s conversation as it stands.`,
      disabled: false,
    },
    {
      mode: 'clear',
      label: `Clear ${who} conversation`,
      help: input.supportsReset
        ? `Send ${CONVERSATION_RESET_COMMAND} first, then deliver the reply.`
        : `${provider} cannot start a conversation over yet, so this would arrive as an ordinary message.`,
      disabled: !input.supportsReset,
    },
    {
      mode: 'custom',
      label: 'Send a custom first message…',
      help: 'Sent on its own, before the reply. The reply waits until it has been answered.',
      disabled: false,
    },
  ]
}

/**
 * The note shown beside a stored opener a build without reset support cannot
 * name, or null.
 *
 * R8's "nothing existing is lost", said out loud: a wire that stored
 * `/clear` for a provider that turned out not to support resetting still
 * carries `/clear`, and the panel says so rather than pretending the text is
 * something the person typed on purpose.
 */
export function customOpenerNote(
  draft: ConnectionDraft,
  supportsReset: boolean,
): string | null {
  if (draft.beforeDelivery !== 'custom') return null
  if (supportsReset) return null
  if (draft.customOpener.trim() !== CONVERSATION_RESET_COMMAND) return null
  return `This connection was saved with ${CONVERSATION_RESET_COMMAND}, which this provider reads as an ordinary message.`
}

/**
 * Whether two drafts differ — the "unsaved changes" question.
 *
 * Compared field by field over the DRAFT rather than over what it would
 * store, because `customOpener` is kept while another mode is selected and a
 * comparison of stored shapes would call that no change at all.
 */
export function connectionDraftIsDirty(
  draft: ConnectionDraft,
  saved: ConnectionDraft,
): boolean {
  return JSON.stringify(draft) !== JSON.stringify(saved)
}
