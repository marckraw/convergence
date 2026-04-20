import type { SessionRow } from '../database/database.types'
import type {
  SessionStatus,
  AttentionState,
  TranscriptEntry,
  ReasoningEffort,
  SessionContextWindow,
  ActivitySignal,
} from '../provider/provider.types'

export type {
  SessionStatus,
  AttentionState,
  TranscriptEntry,
  ReasoningEffort,
  SessionContextWindow,
  ActivitySignal,
}

export type ForkStrategy = 'full' | 'summary'

export interface Session {
  id: string
  projectId: string
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  name: string
  status: SessionStatus
  attention: AttentionState
  workingDirectory: string
  transcript: TranscriptEntry[]
  contextWindow: SessionContextWindow | null
  activity: ActivitySignal
  archivedAt: string | null
  parentSessionId: string | null
  forkStrategy: ForkStrategy | null
  createdAt: string
  updatedAt: string
}

function parseForkStrategy(value: string | null): ForkStrategy | null {
  if (value === 'full' || value === 'summary') return value
  return null
}

export interface CreateSessionInput {
  projectId: string
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  name: string
  parentSessionId?: string | null
  forkStrategy?: ForkStrategy | null
}

function parseActivity(value: string | null): ActivitySignal {
  if (!value) return null
  if (
    value === 'streaming' ||
    value === 'thinking' ||
    value === 'waiting-approval'
  ) {
    return value
  }
  if (value.startsWith('tool:')) {
    return value as ActivitySignal
  }
  return null
}

export function sessionFromRow(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    providerId: row.provider_id,
    model: row.model,
    effort: row.effort as ReasoningEffort | null,
    name: row.name,
    status: row.status as SessionStatus,
    attention: row.attention as AttentionState,
    workingDirectory: row.working_directory,
    transcript: JSON.parse(row.transcript) as TranscriptEntry[],
    contextWindow: row.context_window
      ? (JSON.parse(row.context_window) as SessionContextWindow)
      : null,
    activity: parseActivity(row.activity),
    archivedAt: row.archived_at,
    parentSessionId: row.parent_session_id,
    forkStrategy: parseForkStrategy(row.fork_strategy),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
