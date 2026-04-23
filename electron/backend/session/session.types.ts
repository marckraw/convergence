import type { SessionRow } from '../database/database.types'
import type {
  SessionStatus,
  AttentionState,
  ReasoningEffort,
  SessionContextWindow,
  ActivitySignal,
} from '../provider/provider.types'

export type {
  SessionStatus,
  AttentionState,
  ReasoningEffort,
  SessionContextWindow,
  ActivitySignal,
}

export type ForkStrategy = 'full' | 'summary'

export type PrimarySurface = 'conversation' | 'terminal'

export interface SessionSummary {
  id: string
  projectId: string
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

export interface CreateSessionInput {
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

export function sessionSummaryFromRow(row: SessionRow): SessionSummary {
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
