import type Database from 'better-sqlite3'
import type { SessionRow } from '../database/database.types'
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
}
