import type Database from 'better-sqlite3'
import type { SessionRow } from '../database/database.types'
import { serializeSessionPermissionConfig } from '../provider/session-permissions.pure'
import type {
  CreateSessionInput,
  PrimarySurface,
  SessionContextKind,
} from './session.types'

export interface CreateSessionRecordInput {
  id: string
  contextKind: SessionContextKind
  projectId: string | null
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: CreateSessionInput['effort']
  permissionConfig: CreateSessionInput['permissionConfig']
  name: string
  workingDirectory: string
  parentSessionId: string | null
  forkStrategy: CreateSessionInput['forkStrategy']
  primarySurface: PrimarySurface
  htmlModeEnabled?: boolean
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
           permission_config,
           name,
           working_directory,
           parent_session_id,
           fork_strategy,
           primary_surface,
           html_mode_enabled
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.contextKind,
        input.projectId,
        input.workspaceId,
        input.providerId,
        input.model,
        input.effort,
        serializeSessionPermissionConfig(input.permissionConfig),
        input.name,
        input.workingDirectory,
        input.parentSessionId,
        input.forkStrategy ?? null,
        input.primarySurface,
        input.htmlModeEnabled ? 1 : 0,
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

  setHtmlModeEnabled(id: string, enabled: boolean): void {
    this.db
      .prepare(
        "UPDATE sessions SET html_mode_enabled = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(enabled ? 1 : 0, id)
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
}
