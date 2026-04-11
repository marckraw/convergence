import type { SessionRow } from '../database/database.types'
import type {
  SessionStatus,
  AttentionState,
  TranscriptEntry,
} from '../provider/provider.types'

export type { SessionStatus, AttentionState, TranscriptEntry }

export interface Session {
  id: string
  projectId: string
  workspaceId: string | null
  providerId: string
  name: string
  status: SessionStatus
  attention: AttentionState
  workingDirectory: string
  transcript: TranscriptEntry[]
  createdAt: string
  updatedAt: string
}

export interface CreateSessionInput {
  projectId: string
  workspaceId: string | null
  providerId: string
  name: string
}

export function sessionFromRow(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    providerId: row.provider_id,
    name: row.name,
    status: row.status as SessionStatus,
    attention: row.attention as AttentionState,
    workingDirectory: row.working_directory,
    transcript: JSON.parse(row.transcript) as TranscriptEntry[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
