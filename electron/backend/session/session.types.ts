import type { SessionRow } from '../database/database.types'
import type {
  SessionStatus,
  AttentionState,
  ReasoningEffort,
  SessionContextWindow,
  ActivitySignal,
  MidRunInputMode,
  SessionPermissionConfig,
} from '../provider/provider.types'
import { parseSessionPermissionConfig } from '../provider/session-permissions.pure'
import type { SkillSelection } from '../skills/skills.types'

export type {
  SessionStatus,
  AttentionState,
  ReasoningEffort,
  SessionContextWindow,
  ActivitySignal,
  MidRunInputMode,
  SessionPermissionConfig,
}

export type ForkStrategy = 'full' | 'summary'

export type PrimarySurface = 'conversation' | 'terminal'

/**
 * Where the session's Provider runs: inside the app process or on the
 * configured remote agents daemon.
 */
export type SessionExecutionHostId = 'local' | 'remote'

export type SessionContextKind = 'project' | 'global'

/** The two statuses a session can come to rest in. */
export type SettledSessionStatus = Extract<
  SessionStatus,
  'completed' | 'failed'
>

/**
 * One session coming to rest, emitted once per status transition into
 * `completed` or `failed`. Relays trigger on this; it is deliberately a fact
 * about the transition rather than a snapshot, because by the time subscribers
 * read the session it may already have been started again.
 */
export interface SessionSettledEvent {
  sessionId: string
  status: SettledSessionStatus
  settledAt: string
  /**
   * A human asked for quiet before this session came to rest (F10, MAR-2537).
   *
   * A fact about the settle rather than about any one turn: if any message
   * contributing to the work that just finished asked for quiet, the settle is
   * quiet. The request is cleared as this event is built, so the session comes
   * back armed for the next one. Required rather than optional so a new settle
   * path has to answer the question instead of quietly defaulting.
   */
  relaysMuted: boolean
}

export type SessionSettledListener = (event: SessionSettledEvent) => void

export type AttentionRequestKind =
  | 'approval'
  | 'question'
  | 'plan'
  | 'form'
  | 'url'
  | 'input'

export interface SessionSummary {
  id: string
  contextKind: SessionContextKind
  projectId: string | null
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  serviceTier?: string | null
  permissionConfig?: SessionPermissionConfig
  name: string
  status: SessionStatus
  attention: AttentionState
  attentionRequestKind?: AttentionRequestKind | null
  activity: ActivitySignal
  contextWindow: SessionContextWindow | null
  workingDirectory: string
  archivedAt: string | null
  parentSessionId: string | null
  forkStrategy: ForkStrategy | null
  primarySurface: PrimarySurface
  executionHost: SessionExecutionHostId
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

function parseExecutionHost(
  value: string | null | undefined,
): SessionExecutionHostId {
  if (value === 'remote') return 'remote'
  return 'local'
}

interface CreateSessionBaseInput {
  projectId: string
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  serviceTier?: string | null
  permissionConfig?: SessionPermissionConfig
  name: string
  parentSessionId?: string | null
  forkStrategy?: ForkStrategy | null
  primarySurface?: PrimarySurface
  executionHost?: SessionExecutionHostId
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
  /** Account selected when this input was queued (ADR 0007, PA4). */
  providerAccountId: string | null
  /**
   * True only for a relay opener (F9): this text is a command for the provider
   * and must reach it byte for byte, with no project-context block in front of
   * it. Nothing a person types ever sets this.
   */
  skipContextInjection: boolean
  /**
   * The human silenced this message's wires when they sent it (F10). Recorded
   * here because a queued message may wait through a whole turn, and the mute
   * belongs to the message rather than to whatever the composer shows later.
   */
  relaysMuted: boolean
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
    serviceTier: row.service_tier ?? null,
    permissionConfig: parseSessionPermissionConfig(row.permission_config),
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
    executionHost: parseExecutionHost(row.execution_host),
    continuationToken: row.continuation_token,
    lastSequence: row.last_sequence ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
