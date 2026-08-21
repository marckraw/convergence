import type { SessionQueuedInputRow } from '../database/database.types'
import type { SkillSelection } from '../skills/skills.types'
import type {
  AttentionRequestKind,
  AttentionState,
  QueuedInputState,
  ReasoningEffort,
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
 * The efforts a session row may hold. The renderer only ever offers a model's
 * own options, but this value reaches a provider CLI as an argument, so the
 * boundary re-checks it rather than trusting the caller.
 */
export const REASONING_EFFORTS: readonly ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'max',
  'xhigh',
  'ultra',
]

export function parseReasoningEffort(value: unknown): ReasoningEffort | null {
  if (typeof value !== 'string') return null
  return REASONING_EFFORTS.includes(value as ReasoningEffort)
    ? (value as ReasoningEffort)
    : null
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
