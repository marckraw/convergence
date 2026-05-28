import type { SessionQueuedInputRow } from '../database/database.types'
import type { SkillSelection } from '../skills/skills.types'
import type {
  AttentionRequestKind,
  QueuedInputState,
  SessionQueuedInput,
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
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
