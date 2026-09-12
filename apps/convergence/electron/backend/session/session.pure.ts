import type { SessionQueuedInputRow } from '../database/database.types'
import { SESSION_RESTARTED_EVENT_TYPE } from '../provider/session-restart.pure'
import type { SkillSelection } from '../skills/skills.types'
import type { ConversationItem } from './conversation-item.types'
import type {
  AttentionRequestKind,
  AttentionState,
  QueuedInputState,
  SessionQueuedInput,
  SessionStatus,
  SessionSummary,
  SettledSessionStatus,
} from './session.types'

/**
 * Whether a status means the run behind it has come to rest.
 *
 * Named once because two callers must agree on it: the statement that settles
 * a session, and the guard that decides whether an execution-host event
 * replaying that settle is allowed to release a handle (MAR-2582). A session
 * with two different ideas of "terminal" would release handles on one of them
 * and not the other.
 */
export function isTerminalSessionStatus(
  status: SessionStatus,
): status is SettledSessionStatus {
  return status === 'completed' || status === 'failed'
}

export interface AttentionRequestRowLike {
  kind: 'approval-request' | 'input-request'
  payload_json: string
}

export function isAttentionRequestSummary(
  summary: Pick<SessionSummary, 'attention'>,
): boolean {
  return (
    summary.attention === 'needs-approval' ||
    summary.attention === 'needs-input'
  )
}

export function resolveAttentionRequestKind(
  summary: Pick<SessionSummary, 'attention'>,
  row: AttentionRequestRowLike | null,
): AttentionRequestKind | null {
  if (!isAttentionRequestSummary(summary)) {
    return null
  }

  if (!row) {
    return summary.attention === 'needs-approval' ? 'approval' : 'input'
  }

  if (row.kind === 'approval-request') {
    return 'approval'
  }

  try {
    const payload = JSON.parse(row.payload_json) as {
      request?: { kind?: unknown }
    }
    switch (payload.request?.kind) {
      case 'choice':
        return 'question'
      case 'plan':
        return 'plan'
      case 'form':
        return 'form'
      case 'url':
        return 'url'
      case 'text':
        return 'input'
      default:
        return 'input'
    }
  } catch {
    return 'input'
  }
}

export function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function queuedInputFromRow(
  row: SessionQueuedInputRow,
): SessionQueuedInput {
  return {
    id: row.id,
    sessionId: row.session_id,
    deliveryMode: row.delivery_mode as SessionQueuedInput['deliveryMode'],
    state: row.state as QueuedInputState,
    text: row.text,
    attachmentIds: parseJsonArray<string>(row.attachment_ids_json),
    skillSelections: parseJsonArray<SkillSelection>(row.skill_selections_json),
    providerRequestId: row.provider_request_id,
    providerAccountId: row.provider_account_id ?? null,
    skipContextInjection: row.skip_context_injection === 1,
    relaysMuted: row.relays_muted === 1,
    dispatchId: row.dispatch_id ?? null,
    // Never null in practice: the migration backfills every existing row
    // from `rowid` in the same transaction that adds the column, and
    // `enqueue` sets it for every new one. A row that somehow had none
    // arrived before everything that has one, which is what 0 says.
    queuePosition: row.queue_position ?? 0,
    // Whether something replaced this row is a fact about ANOTHER row, so a
    // single-row read cannot know it. `list` overrides this after asking.
    redeliveredBy: false,
    redeliveredFrom: row.redelivered_from ?? null,
    endingToldAt: row.ending_told_at ?? null,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Why this session cannot take a new model or effort right now, or `null` when
 * it can (MAR-2550).
 *
 * Every provider reads model and effort at turn time, so an idle session
 * already runs its next turn on whatever the row says. A live handle, though,
 * closed over the config it spawned with: a change made while a process is
 * attached would be written and then quietly ignored by the turn the human is
 * watching. Refusing with a reason is the honest answer — the caller turns
 * this string into a visible failure.
 *
 * `hasActiveHandle` and `hasDispatchInFlight` are the load-bearing conditions,
 * and they are two halves of one question: a handle covers a process that
 * exists, a dispatch covers the send that is on its way to creating one. Status
 * and attention are here because they are what the human can see, and a refusal
 * that names an invisible process would read as a bug.
 *
 * Every field is required rather than optional. The dispatch window was open
 * because nobody was asked about it; a condition a caller may omit is a
 * condition that gets omitted.
 */
export function describeModelSelectionRefusal(session: {
  status: SessionStatus
  attention: AttentionState
  hasActiveHandle: boolean
  hasDispatchInFlight: boolean
}): string | null {
  if (session.status === 'running') {
    return 'Model and effort can only change while the session is idle. Wait for the current turn to finish.'
  }
  if (
    session.attention === 'needs-approval' ||
    session.attention === 'needs-input'
  ) {
    return 'Model and effort can only change while the session is idle. Answer the agent first.'
  }
  if (session.hasActiveHandle) {
    return 'Model and effort can only change while the session is idle. This session still has a provider process attached.'
  }
  if (session.hasDispatchInFlight) {
    return 'Model and effort can only change while the session is idle. A message is already on its way to the provider.'
  }
  return null
}

/**
 * Why a model selection made against one provider must not be written onto a
 * session that runs on another, or `null` when the caller agrees with the row
 * (MAR-2550).
 *
 * An identity check, not a catalog check. It asks "does the caller agree with
 * me about which provider this session runs on?" — a question with no list
 * behind it, so unlike a model-id allowlist it cannot rot the way MAR-2034 and
 * MAR-2046 did. The set of legal answers is one element long and the row itself
 * holds it.
 *
 * The provider is fixed for the life of a session because continuation tokens
 * are provider-specific. Until now that rule lived only in the renderer, on one
 * of the two controls that can change a model, and the other one — the model
 * dialog, which carries a provider dimension — quietly kept the power. A guard
 * on the control is an affordance; a guard where the row is written is the law.
 */
export function describeProviderIdentityRefusal(
  session: { providerId: string },
  requestedProviderId: string,
): string | null {
  if (!requestedProviderId) {
    return 'A model selection must say which provider it was made against. The provider is fixed for the life of a session.'
  }
  if (requestedProviderId !== session.providerId) {
    return `This selection was made against ${requestedProviderId}, but the session runs on ${session.providerId}. The provider is fixed for the life of a session.`
  }
  return null
}

/**
 * Whether the conversation shows no turn taken since its last boundary.
 *
 * A boundary is the marker a provider draws when it mints a new conversation
 * underneath the session -- `/clear` (`SESSION_RESTARTED_EVENT_TYPE`). The
 * question this answers is one only the transcript can: *is the conversation
 * the continuation token names one that has never been spoken to?*
 *
 * A provider needs it because the wire cannot tell it apart from a much worse
 * thing. Codex refuses to resume a thread that took no turn and a thread whose
 * rollout was pruned off disk with the same sentence, and the two demand
 * opposite behaviour: silence after a deliberate clear, an honest "previous
 * context may be missing" after a real loss (MAR-2854).
 *
 * Anything but a note ends it. Notes are the one kind a provider writes
 * unprompted -- a warning, an obituary, the boundary itself -- so they are the
 * one kind that cannot mean a turn was taken; everything else in a transcript
 * exists because one was. Asking the narrower question ("was there a *user*
 * message?") would answer identically on every reachable transcript and be
 * wrong on the first one that is not, which is the wrong direction to be wrong
 * in: this flag's only power is to silence a warning, so it must fail toward
 * saying it.
 */
export function hasNoTurnSinceLastBoundary(
  items: readonly ConversationItem[],
): boolean {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.kind !== 'note') return false
    if (
      item.kind === 'note' &&
      item.providerMeta.providerEventType === SESSION_RESTARTED_EVENT_TYPE
    ) {
      return true
    }
  }
  return false
}

/**
 * The assistant's own words so far, for the flows that prime a new provider
 * process with them (local relays and forks).
 */
export function previousAssistantMessageTexts(
  items: readonly ConversationItem[],
): string[] {
  return items
    .filter(
      (item): item is Extract<ConversationItem, { kind: 'message' }> =>
        item.kind === 'message' &&
        item.actor === 'assistant' &&
        item.text.trim().length > 0,
    )
    .map((item) => item.text)
}
