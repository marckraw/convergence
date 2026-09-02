import type { ExecutionSessionWorkspace } from '@mrck-labs/execution-host-protocol'
import type { SessionRow } from '../database/database.types'
import { parseExecutionHostId } from '../execution-host-endpoint/execution-host-endpoint.pure'
import { parseReportedWorkspace } from './reported-workspace.pure'
import {
  parseSessionWorkAddress,
  type SessionWorkAddress,
} from '../../../src/shared/lib/work-address.pure'
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
 * Where the session's Provider runs: `'local'` for inside the app process, or
 * the id of an execution host Endpoint (MAR-2620).
 *
 * Deliberately not a union of literals. There is exactly one value this code
 * may name — `LOCAL_EXECUTION_HOST_ID` — and every other value is an id the
 * user's own configuration created. Branch with `isLocalExecutionHost` /
 * `isRemoteExecutionHost`, or look the Endpoint up; comparing against a
 * hard-coded remote name is the bug this type change exists to make
 * impossible.
 */
export type SessionExecutionHostId = string

/**
 * How many sessions name one execution host (MAR-2642).
 *
 * A list of pairs rather than a record keyed by id, all the way to the
 * renderer. The keys here are execution host ids read off session rows —
 * outside data — and a bare object indexed by outside data answers `toString`
 * with a function and swallows `__proto__` through the prototype setter. A
 * pair carries its id as a value, so nothing between the query and the warning
 * has to index an object with it.
 */
export interface ExecutionHostSessionCount {
  executionHostId: string
  sessions: number
}

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
  /**
   * The delivery receipt (MAR-2759): the dispatch ids the settling turn
   * consumed. The session layer is the only party that knows which turn
   * carried which input -- it owns the queue and decides native-vs-queued per
   * capability -- so it says so here instead of leaving subscribers to guess
   * from status snapshots. Every send gets a receipt, human-typed included;
   * a subscriber only recognises the ids it is holding, so naming the rest
   * costs nothing. Empty when no tracked dispatch entered the turn (a settle
   * replayed after a restart, a remote turn started elsewhere). Required for
   * the same reason `relaysMuted` is: a new settle path must answer the
   * question.
   */
  dispatchIds: string[]
}

export type SessionSettledListener = (event: SessionSettledEvent) => void

/**
 * Why a dispatch reached its end without a settle (MAR-2759, design P).
 *
 * **The receipt lifecycle invariant: every dispatched receipt reaches exactly
 * one terminal.** Four endings, and only four: `settled` (its turn ended --
 * the settle event names it, not this), or one of these three words:
 *
 * - `cancelled` -- the user withdrew that one queued input. Quiet.
 * - `abandoned` -- the user deleted the session that held it. Quiet.
 * - `failed` -- the system could not run it: the send it queued behind was
 *   refused at the provider, the run it waited on was found stale, the turn
 *   ahead of it failed, or the queue itself could not be drained. LOUD: the
 *   work did not happen and nobody chose that, so the stall clock calls it
 *   without waiting for the window.
 */
export type DispatchTerminalReason = 'cancelled' | 'abandoned' | 'failed'

/**
 * A dispatch that will never be named by a settle (MAR-2759).
 *
 * The delivery receipt's other ending. A settle names the ids its turn
 * consumed; an input that ends short of a turn consumes nothing and settles
 * never -- so the parties holding those receipts (the relay engine's batons,
 * the hop's stamp) would wait for the rest of the process's life. The
 * session layer owns the rows and the in-flight set, so it says exactly
 * which ids ended, on EVERY transition out of carrying a turn -- not only
 * the ones a user asked for. Exact ids, never a session: a sibling receipt
 * in the same session is still owed.
 */
export interface DispatchTerminalEvent {
  sessionId: string
  reason: DispatchTerminalReason
  dispatchIds: string[]
  at: string
}

export type DispatchTerminalListener = (event: DispatchTerminalEvent) => void

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
  /**
   * Where a remote session works, as it was stated on the strip before send
   * (MAR-2689). Null on a local session: it works in `workingDirectory`, which
   * the record already names.
   */
  workAddress: SessionWorkAddress | null
  /**
   * What the daemon said it actually did, once it has said anything
   * (MAR-2694). Null on a local session, and on a remote one until the machine
   * answers -- the record's silence, never a guess standing in for it.
   */
  reportedWorkspace: ExecutionSessionWorkspace | null
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
  serviceTier?: string | null
  permissionConfig?: SessionPermissionConfig
  name: string
  parentSessionId?: string | null
  forkStrategy?: ForkStrategy | null
  primarySurface?: PrimarySurface
  executionHost?: SessionExecutionHostId
  /**
   * The place the strip stated for a remote session. Absent on a local one,
   * and absent on a remote one only when the strip could name no place at all —
   * which the record then says in so many words rather than leaving blank
   * (MAR-2689).
   */
  workAddress?: SessionWorkAddress | null
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
  /**
   * The dispatch id minted when this input was handed over (MAR-2759), or
   * null for input people typed. It rides the durable queue row so a restart
   * cannot orphan it: whichever turn this input eventually starts settles
   * carrying this id, and the relay ledger stamps the right hop.
   */
  dispatchId: string | null
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
    executionHost: parseExecutionHostId(row.execution_host),
    workAddress: parseSessionWorkAddress(row.work_address),
    reportedWorkspace: parseReportedWorkspace(row.reported_workspace),
    continuationToken: row.continuation_token,
    lastSequence: row.last_sequence ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
