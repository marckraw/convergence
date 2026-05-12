import type {
  SpaceAttemptRow,
  SpaceArtifactRow,
  SpaceRow,
  SpaceSourceRow,
} from '../database/database.types'

export type SpaceStatus =
  | 'exploring'
  | 'planned'
  | 'implementing'
  | 'reviewing'
  | 'ready-to-merge'
  | 'merged'
  | 'released'
  | 'parked'
  | 'discarded'

export type SpaceAttention =
  | 'none'
  | 'needs-you'
  | 'needs-decision'
  | 'blocked'
  | 'stale'

export type SpaceAttemptRole =
  | 'seed'
  | 'exploration'
  | 'implementation'
  | 'review'
  | 'hardening'
  | 'docs'

export type SpaceArtifactKind =
  | 'pull-request'
  | 'branch'
  | 'commit-range'
  | 'release'
  | 'spec'
  | 'documentation'
  | 'migration-note'
  | 'external-issue'
  | 'other'

export type SpaceArtifactStatus =
  | 'planned'
  | 'in-progress'
  | 'ready'
  | 'merged'
  | 'released'
  | 'abandoned'

export interface Space {
  id: string
  title: string
  status: SpaceStatus
  attention: SpaceAttention
  brief: string
  memory: string
  createdAt: string
  updatedAt: string
}

export interface SpaceAttempt {
  id: string
  spaceId: string
  sessionId: string
  role: SpaceAttemptRole
  isPrimary: boolean
  createdAt: string
}

export interface SpaceArtifact {
  id: string
  spaceId: string
  kind: SpaceArtifactKind
  label: string
  value: string
  sourceSessionId: string | null
  status: SpaceArtifactStatus
  createdAt: string
  updatedAt: string
}

export interface SpaceSource {
  id: string
  spaceId: string
  filename: string
  originalPath: string
  storagePath: string
  sizeBytes: number
  createdAt: string
}

export interface CreateSpaceInput {
  title: string
  status?: SpaceStatus
  attention?: SpaceAttention
  brief?: string
  memory?: string
}

export interface UpdateSpaceInput {
  title?: string
  status?: SpaceStatus
  attention?: SpaceAttention
  brief?: string
  memory?: string
}

export interface LinkSpaceAttemptInput {
  spaceId: string
  sessionId: string
  role?: SpaceAttemptRole
  isPrimary?: boolean
}

export interface UpdateSpaceAttemptInput {
  role?: SpaceAttemptRole
}

export interface CreateSpaceArtifactInput {
  spaceId: string
  kind: SpaceArtifactKind
  label: string
  value: string
  sourceSessionId?: string | null
  status?: SpaceArtifactStatus
}

export interface UpdateSpaceArtifactInput {
  kind?: SpaceArtifactKind
  label?: string
  value?: string
  sourceSessionId?: string | null
  status?: SpaceArtifactStatus
}

export interface AddSpaceSourcesFromPathsInput {
  spaceId: string
  paths: string[]
}

export function spaceFromRow(row: SpaceRow): Space {
  return {
    id: row.id,
    title: row.title,
    status: parseSpaceStatus(row.status),
    attention: parseSpaceAttention(row.attention),
    brief: row.brief,
    memory: row.memory ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function spaceAttemptFromRow(row: SpaceAttemptRow): SpaceAttempt {
  return {
    id: row.id,
    spaceId: row.space_id,
    sessionId: row.session_id,
    role: parseSpaceAttemptRole(row.role),
    isPrimary: row.is_primary === 1,
    createdAt: row.created_at,
  }
}

export function spaceArtifactFromRow(row: SpaceArtifactRow): SpaceArtifact {
  return {
    id: row.id,
    spaceId: row.space_id,
    kind: parseSpaceArtifactKind(row.kind),
    label: row.label,
    value: row.value,
    sourceSessionId: row.source_session_id,
    status: parseSpaceArtifactStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function spaceSourceFromRow(row: SpaceSourceRow): SpaceSource {
  return {
    id: row.id,
    spaceId: row.space_id,
    filename: row.filename,
    originalPath: row.original_path,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  }
}

function parseSpaceStatus(value: string): SpaceStatus {
  if (
    value === 'planned' ||
    value === 'implementing' ||
    value === 'reviewing' ||
    value === 'ready-to-merge' ||
    value === 'merged' ||
    value === 'released' ||
    value === 'parked' ||
    value === 'discarded'
  ) {
    return value
  }
  return 'exploring'
}

function parseSpaceAttention(value: string): SpaceAttention {
  if (
    value === 'needs-you' ||
    value === 'needs-decision' ||
    value === 'blocked' ||
    value === 'stale'
  ) {
    return value
  }
  return 'none'
}

function parseSpaceAttemptRole(value: string): SpaceAttemptRole {
  if (
    value === 'seed' ||
    value === 'implementation' ||
    value === 'review' ||
    value === 'hardening' ||
    value === 'docs'
  ) {
    return value
  }
  return 'exploration'
}

export function parseSpaceArtifactKind(value: string): SpaceArtifactKind {
  if (
    value === 'pull-request' ||
    value === 'branch' ||
    value === 'commit-range' ||
    value === 'release' ||
    value === 'spec' ||
    value === 'documentation' ||
    value === 'migration-note' ||
    value === 'external-issue'
  ) {
    return value
  }
  return 'other'
}

export function parseSpaceArtifactStatus(value: string): SpaceArtifactStatus {
  if (
    value === 'in-progress' ||
    value === 'ready' ||
    value === 'merged' ||
    value === 'released' ||
    value === 'abandoned'
  ) {
    return value
  }
  return 'planned'
}
