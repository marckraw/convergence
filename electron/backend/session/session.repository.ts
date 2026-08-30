import type Database from 'better-sqlite3'
import type { ExecutionSessionWorkspace } from '@mrck-labs/execution-host-protocol'
import type { SessionRow } from '../database/database.types'
import { serializeReportedWorkspace } from './reported-workspace.pure'
import { serializeSessionPermissionConfig } from '../provider/session-permissions.pure'
import {
  serializeSessionWorkAddress,
  type SessionWorkAddress,
} from '../../../src/shared/lib/work-address.pure'
import type {
  CreateSessionInput,
  PrimarySurface,
  ReasoningEffort,
  SessionContextKind,
  SessionExecutionHostId,
} from './session.types'

export interface CreateSessionRecordInput {
  id: string
  contextKind: SessionContextKind
  projectId: string | null
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: CreateSessionInput['effort']
  serviceTier?: CreateSessionInput['serviceTier']
  permissionConfig: CreateSessionInput['permissionConfig']
  name: string
  workingDirectory: string
  parentSessionId: string | null
  forkStrategy: CreateSessionInput['forkStrategy']
  primarySurface: PrimarySurface
  executionHost: SessionExecutionHostId
  /** Where a remote session works; null on a local one (MAR-2689). */
  workAddress: SessionWorkAddress | null
}

export class SessionRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateSessionRecordInput): void {
    this.db
      .prepare(
        `INSERT INTO sessions (
           id,
           context_kind,
           project_id,
           workspace_id,
           provider_id,
           model,
           effort,
           service_tier,
           permission_config,
           name,
           working_directory,
           parent_session_id,
           fork_strategy,
           primary_surface,
           execution_host,
           work_address
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.contextKind,
        input.projectId,
        input.workspaceId,
        input.providerId,
        input.model,
        input.effort,
        input.serviceTier ?? null,
        serializeSessionPermissionConfig(input.permissionConfig),
        input.name,
        input.workingDirectory,
        input.parentSessionId,
        input.forkStrategy ?? null,
        input.primarySurface,
        input.executionHost,
        input.workAddress
          ? serializeSessionWorkAddress(input.workAddress)
          : null,
      )
  }

  findById(id: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined
  }

  listByProjectId(projectId: string): SessionRow[] {
    return this.db
      .prepare(
        "SELECT * FROM sessions WHERE context_kind = 'project' AND project_id = ? ORDER BY created_at DESC",
      )
      .all(projectId) as SessionRow[]
  }

  listAll(): SessionRow[] {
    return this.db
      .prepare('SELECT * FROM sessions ORDER BY created_at DESC')
      .all() as SessionRow[]
  }

  listGlobal(): SessionRow[] {
    return this.db
      .prepare(
        "SELECT * FROM sessions WHERE context_kind = 'global' ORDER BY created_at DESC",
      )
      .all() as SessionRow[]
  }

  listRunningNonShell(): SessionRow[] {
    return this.db
      .prepare(
        `SELECT *
         FROM sessions
         WHERE status = 'running'
           AND provider_id != 'shell'`,
      )
      .all() as SessionRow[]
  }

  /**
   * How many sessions recorded each execution host id (MAR-2642).
   *
   * Removing an Endpoint is not free: a session that named it refuses to run
   * once it is gone (MAR-2620), so the settings surface has to be able to say
   * how many refusals a removal buys. Counted over every row rather than the
   * loaded session list, which only ever holds one project's worth — a count
   * that missed the other projects would understate the damage.
   */
  countByExecutionHost(): Array<{ executionHost: string; count: number }> {
    return this.db
      .prepare(
        `SELECT execution_host AS executionHost, COUNT(*) AS count
         FROM sessions
         GROUP BY execution_host`,
      )
      .all() as Array<{ executionHost: string; count: number }>
  }

  rename(id: string, name: string): void {
    this.db
      .prepare(
        "UPDATE sessions SET name = ?, name_auto_generated = 1, updated_at = datetime('now') WHERE id = ?",
      )
      .run(name, id)
  }

  setPrimarySurface(id: string, surface: PrimarySurface): void {
    this.db
      .prepare(
        "UPDATE sessions SET primary_surface = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(surface, id)
  }

  /**
   * Rewrites the standing model intention for a session (MAR-2550).
   *
   * The columns were write-once at create until now. They are read fresh from
   * this row at the start of every resumed turn, so this single statement is
   * the whole of what makes a mid-conversation model change take effect.
   */
  setModelSelection(
    id: string,
    model: string | null,
    effort: ReasoningEffort | null,
  ): void {
    this.db
      .prepare(
        "UPDATE sessions SET model = ?, effort = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(model, effort, id)
  }

  isAutoNamed(id: string): boolean {
    const row = this.db
      .prepare('SELECT name_auto_generated FROM sessions WHERE id = ?')
      .get(id) as { name_auto_generated: number } | undefined
    return (row?.name_auto_generated ?? 0) === 1
  }

  setArchivedAt(id: string, archivedAt: string | null): void {
    this.db
      .prepare(
        "UPDATE sessions SET archived_at = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(archivedAt, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }

  getExecutionHostLastSeq(id: string): number {
    const row = this.db
      .prepare('SELECT execution_host_last_seq FROM sessions WHERE id = ?')
      .get(id) as { execution_host_last_seq: number } | undefined
    return row?.execution_host_last_seq ?? 0
  }

  setExecutionHostLastSeq(id: string, seq: number): void {
    this.db
      .prepare(
        `UPDATE sessions
         SET execution_host_last_seq = ?
         WHERE id = ? AND execution_host_last_seq < ?`,
      )
      .run(seq, id, seq)
  }

  /**
   * Records what the daemon said it actually did, from the start response
   * (MAR-2694).
   *
   * Unconditional, because this door is the authoritative one: the start
   * response is the daemon describing the workspace it materialised for this
   * session, in the beat it accepted it. `updated_at` is deliberately left
   * alone -- this is the record learning a fact that was already true, not the
   * session changing.
   *
   * Its pair below fills only an absence. The two used to be one blind
   * `UPDATE` whose rule was "the newest answer wins", which is a rule about
   * arrival order and not about authority: a snapshot fetch that began before
   * the start landed, or came back with an older view, durably overwrote what
   * the start had recorded, and no read-side guard can undo that because the
   * record itself is what got replaced. Precedence belongs in the write
   * (MAR-2694 round 2).
   */
  setReportedWorkspace(id: string, workspace: ExecutionSessionWorkspace): void {
    this.db
      .prepare('UPDATE sessions SET reported_workspace = ? WHERE id = ?')
      .run(serializeReportedWorkspace(workspace), id)
  }

  /**
   * Records a workspace read from a session snapshot, and only onto a record
   * that has none (MAR-2694 round 2).
   *
   * The fetch door exists for the sessions the start door could not fill: a
   * daemon predating the start-response echo, or a session born before this
   * shipped. It is a filler, never a corrector, and `WHERE reported_workspace
   * IS NULL` is that sentence in SQL -- the ordering of two answers cannot
   * change which one the record ends on.
   *
   * @returns whether this fetch was the one that filled the record.
   */
  fillMissingReportedWorkspace(
    id: string,
    workspace: ExecutionSessionWorkspace,
  ): boolean {
    const result = this.db
      .prepare(
        `UPDATE sessions
         SET reported_workspace = ?
         WHERE id = ? AND reported_workspace IS NULL`,
      )
      .run(serializeReportedWorkspace(workspace), id)
    return result.changes > 0
  }
}
