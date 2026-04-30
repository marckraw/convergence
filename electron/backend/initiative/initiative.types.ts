import type {
  InitiativeAttemptRow,
  InitiativeOutputRow,
  InitiativeRow,
} from '../database/database.types'

export type InitiativeStatus =
  | 'exploring'
  | 'planned'
  | 'implementing'
  | 'reviewing'
  | 'ready-to-merge'
  | 'merged'
  | 'released'
  | 'parked'
  | 'discarded'

export type InitiativeAttention =
  | 'none'
  | 'needs-you'
  | 'needs-decision'
  | 'blocked'
  | 'stale'

export type InitiativeAttemptRole =
  | 'seed'
  | 'exploration'
  | 'implementation'
  | 'review'
  | 'hardening'
  | 'docs'

export type InitiativeOutputKind =
  | 'pull-request'
  | 'branch'
  | 'commit-range'
  | 'release'
  | 'spec'
  | 'documentation'
  | 'migration-note'
  | 'external-issue'
  | 'other'

export type InitiativeOutputStatus =
  | 'planned'
  | 'in-progress'
  | 'ready'
  | 'merged'
  | 'released'
  | 'abandoned'

export interface Initiative {
  id: string
  title: string
  status: InitiativeStatus
  attention: InitiativeAttention
  currentUnderstanding: string
  createdAt: string
  updatedAt: string
}

export interface InitiativeAttempt {
  id: string
  initiativeId: string
  sessionId: string
  role: InitiativeAttemptRole
  isPrimary: boolean
  createdAt: string
}

export interface InitiativeOutput {
  id: string
  initiativeId: string
  kind: InitiativeOutputKind
  label: string
  value: string
  sourceSessionId: string | null
  status: InitiativeOutputStatus
  createdAt: string
  updatedAt: string
}

export interface CreateInitiativeInput {
  title: string
  status?: InitiativeStatus
  attention?: InitiativeAttention
  currentUnderstanding?: string
}

export interface UpdateInitiativeInput {
  title?: string
  status?: InitiativeStatus
  attention?: InitiativeAttention
  currentUnderstanding?: string
}

export interface LinkInitiativeAttemptInput {
  initiativeId: string
  sessionId: string
  role?: InitiativeAttemptRole
  isPrimary?: boolean
}

export interface UpdateInitiativeAttemptInput {
  role?: InitiativeAttemptRole
}

export interface CreateInitiativeOutputInput {
  initiativeId: string
  kind: InitiativeOutputKind
  label: string
  value: string
  sourceSessionId?: string | null
  status?: InitiativeOutputStatus
}

export interface UpdateInitiativeOutputInput {
  kind?: InitiativeOutputKind
  label?: string
  value?: string
  sourceSessionId?: string | null
  status?: InitiativeOutputStatus
}

export function initiativeFromRow(row: InitiativeRow): Initiative {
  return {
    id: row.id,
    title: row.title,
    status: parseInitiativeStatus(row.status),
    attention: parseInitiativeAttention(row.attention),
    currentUnderstanding: row.current_understanding,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function initiativeAttemptFromRow(
  row: InitiativeAttemptRow,
): InitiativeAttempt {
  return {
    id: row.id,
    initiativeId: row.initiative_id,
    sessionId: row.session_id,
    role: parseInitiativeAttemptRole(row.role),
    isPrimary: row.is_primary === 1,
    createdAt: row.created_at,
  }
}

export function initiativeOutputFromRow(
  row: InitiativeOutputRow,
): InitiativeOutput {
  return {
    id: row.id,
    initiativeId: row.initiative_id,
    kind: parseInitiativeOutputKind(row.kind),
    label: row.label,
    value: row.value,
    sourceSessionId: row.source_session_id,
    status: parseInitiativeOutputStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseInitiativeStatus(value: string): InitiativeStatus {
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

function parseInitiativeAttention(value: string): InitiativeAttention {
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

function parseInitiativeAttemptRole(value: string): InitiativeAttemptRole {
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

export function parseInitiativeOutputKind(value: string): InitiativeOutputKind {
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

export function parseInitiativeOutputStatus(
  value: string,
): InitiativeOutputStatus {
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
