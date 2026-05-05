import type { SessionRow } from '../database/database.types'
import type {
  SessionStatus,
  AttentionState,
  ReasoningEffort,
  SessionContextWindow,
  ActivitySignal,
  MidRunInputMode,
} from '../provider/provider.types'
import type { SkillSelection } from '../skills/skills.types'

export type {
  SessionStatus,
  AttentionState,
  ReasoningEffort,
  SessionContextWindow,
  ActivitySignal,
  MidRunInputMode,
}

export type ForkStrategy = 'full' | 'summary'

export type PrimarySurface = 'conversation' | 'terminal'

export type SessionContextKind = 'project' | 'global'

export interface SessionSummary {
  id: string
  contextKind: SessionContextKind
  projectId: string | null
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  name: string
  status: SessionStatus
  attention: AttentionState
  activity: ActivitySignal
  contextWindow: SessionContextWindow | null
  workingDirectory: string
  archivedAt: string | null
  parentSessionId: string | null
  forkStrategy: ForkStrategy | null
  primarySurface: PrimarySurface
  continuationToken: string | null
  lastSequence: number
  createdAt: string
  updatedAt: string
}

export type Session = SessionSummary

function parseForkStrategy(value: string | null): ForkStrategy | null {
  if (value === 'full' || value === 'summary') return value
  return null
}

function parsePrimarySurface(value: string | null | undefined): PrimarySurface {
  if (value === 'terminal') return 'terminal'
  return 'conversation'
}

interface CreateSessionBaseInput {
  projectId: string
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  name: string
  parentSessionId?: string | null
  forkStrategy?: ForkStrategy | null
  primarySurface?: PrimarySurface
}

export type CreateSessionInput =
  | (CreateSessionBaseInput & {
      contextKind?: 'project'
      projectId: string
      workspaceId: string | null
    })
  | (Omit<CreateSessionBaseInput, 'projectId' | 'workspaceId'> & {
      contextKind: 'global'
      projectId?: null
      workspaceId?: null
    })

export type QueuedInputState =
  | 'queued'
  | 'dispatching'
  | 'sent'
  | 'failed'
  | 'cancelled'

export interface SessionQueuedInput {
  id: string
  sessionId: string
  deliveryMode: Extract<MidRunInputMode, 'follow-up' | 'steer' | 'interrupt'>
  state: QueuedInputState
  text: string
  attachmentIds: string[]
  skillSelections: SkillSelection[]
  providerRequestId: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface QueuedInputPatchEvent {
  sessionId: string
  op: 'add' | 'patch'
  item: SessionQueuedInput
}

function parseActivity(value: string | null): ActivitySignal {
  if (!value) return null
  if (
    value === 'streaming' ||
    value === 'thinking' ||
    value === 'compacting' ||
    value === 'waiting-approval'
  ) {
    return value
  }
  if (value.startsWith('tool:')) {
    return value as ActivitySignal
  }
  return null
}

export function sessionSummaryFromRow(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    contextKind: row.context_kind === 'global' ? 'global' : 'project',
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    providerId: row.provider_id,
    model: row.model,
    effort: row.effort as ReasoningEffort | null,
    name: row.name,
    status: row.status as SessionStatus,
    attention: row.attention as AttentionState,
    activity: parseActivity(row.activity),
    contextWindow: row.context_window
      ? (JSON.parse(row.context_window) as SessionContextWindow)
      : null,
    workingDirectory: row.working_directory,
    archivedAt: row.archived_at,
    parentSessionId: row.parent_session_id,
    forkStrategy: parseForkStrategy(row.fork_strategy),
    primarySurface: parsePrimarySurface(row.primary_surface),
    continuationToken: row.continuation_token,
    lastSequence: row.last_sequence ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
