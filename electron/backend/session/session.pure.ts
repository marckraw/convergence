import type { SessionQueuedInputRow } from '../database/database.types'
import type { SkillSelection } from '../skills/skills.types'
import type {
  AttentionRequestKind,
  AttentionState,
  QueuedInputState,
  SessionQueuedInput,
  SessionStatus,
  SessionSummary,
} from './session.types'

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
 * `hasActiveHandle` is the load-bearing condition; status and attention are
 * here because they are what the human can see, and a refusal that names an
 * invisible process would read as a bug.
 */
export function describeModelSelectionRefusal(session: {
  status: SessionStatus
  attention: AttentionState
  hasActiveHandle: boolean
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
