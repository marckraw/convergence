import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type {
  SpaceAttemptRow,
  SpaceArtifactRow,
  SpaceRow,
} from '../database/database.types'
import {
  spaceAttemptFromRow,
  spaceFromRow,
  spaceArtifactFromRow,
  type CreateSpaceInput,
  type CreateSpaceArtifactInput,
  type Space,
  type SpaceAttempt,
  type SpaceArtifact,
  type LinkSpaceAttemptInput,
  type UpdateSpaceAttemptInput,
  type UpdateSpaceInput,
  type UpdateSpaceArtifactInput,
} from './space.types'
import { normalizeOptionalText, normalizeRequiredText } from './space.pure'

export class SpaceService {
  constructor(private db: Database.Database) {}

  list(): Space[] {
    const rows = this.db
      .prepare('SELECT * FROM spaces ORDER BY updated_at DESC')
      .all() as SpaceRow[]

    return rows.map(spaceFromRow)
  }

  getById(id: string): Space | null {
    const row = this.getSpaceRow(id)
    return row ? spaceFromRow(row) : null
  }

  create(input: CreateSpaceInput): Space {
    const id = randomUUID()
    const title = normalizeRequiredText(input.title, 'Space title')
    const brief = normalizeOptionalText(input.brief)

    this.db
      .prepare(
        `INSERT INTO spaces (
           id, title, status, attention, brief
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        title,
        input.status ?? 'exploring',
        input.attention ?? 'none',
        brief,
      )

    return this.getById(id)!
  }

  update(id: string, input: UpdateSpaceInput): Space {
    if (!this.getSpaceRow(id)) {
      throw new Error(`Space not found: ${id}`)
    }

    const existing = this.getById(id)!
    const title =
      input.title === undefined
        ? existing.title
        : normalizeRequiredText(input.title, 'Space title')
    const brief =
      input.brief === undefined ? existing.brief : input.brief.trim()

    this.db
      .prepare(
        `UPDATE spaces
         SET title = ?,
             status = ?,
             attention = ?,
             brief = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        title,
        input.status ?? existing.status,
        input.attention ?? existing.attention,
        brief,
        id,
      )

    return this.getById(id)!
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM spaces WHERE id = ?').run(id)
  }

  listAttempts(spaceId: string): SpaceAttempt[] {
    this.assertSpaceExists(spaceId)
    const rows = this.db
      .prepare(
        `SELECT * FROM space_attempts
         WHERE space_id = ?
         ORDER BY is_primary DESC, created_at ASC`,
      )
      .all(spaceId) as SpaceAttemptRow[]

    return rows.map(spaceAttemptFromRow)
  }

  listAttemptsForSession(sessionId: string): SpaceAttempt[] {
    this.assertSessionExists(sessionId)
    const rows = this.db
      .prepare(
        `SELECT * FROM space_attempts
         WHERE session_id = ?
         ORDER BY is_primary DESC, created_at ASC`,
      )
      .all(sessionId) as SpaceAttemptRow[]

    return rows.map(spaceAttemptFromRow)
  }

  linkAttempt(input: LinkSpaceAttemptInput): SpaceAttempt {
    this.assertSpaceExists(input.spaceId)
    this.assertSessionExists(input.sessionId)

    const existing = this.db
      .prepare(
        `SELECT * FROM space_attempts
         WHERE space_id = ? AND session_id = ?`,
      )
      .get(input.spaceId, input.sessionId) as SpaceAttemptRow | undefined

    if (existing) {
      throw new Error('Session is already linked to this Space')
    }

    const existingCount = (
      this.db
        .prepare(
          'SELECT COUNT(*) as count FROM space_attempts WHERE space_id = ?',
        )
        .get(input.spaceId) as { count: number }
    ).count
    const isPrimary = input.isPrimary ?? existingCount === 0
    const id = randomUUID()

    const insert = this.db.transaction(() => {
      if (isPrimary) {
        this.clearPrimaryAttempts(input.spaceId)
      }

      this.db
        .prepare(
          `INSERT INTO space_attempts (
             id, space_id, session_id, role, is_primary
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.spaceId,
          input.sessionId,
          input.role ?? 'exploration',
          isPrimary ? 1 : 0,
        )
      this.touchSpace(input.spaceId)
    })

    insert()
    return this.getAttemptById(id)!
  }

  updateAttempt(id: string, input: UpdateSpaceAttemptInput): SpaceAttempt {
    const attempt = this.getAttemptById(id)
    if (!attempt) throw new Error(`Space attempt not found: ${id}`)

    this.db
      .prepare('UPDATE space_attempts SET role = ? WHERE id = ?')
      .run(input.role ?? attempt.role, id)
    this.touchSpace(attempt.spaceId)

    return this.getAttemptById(id)!
  }

  unlinkAttempt(id: string): void {
    const attempt = this.getAttemptById(id)
    if (!attempt) return
    this.db.prepare('DELETE FROM space_attempts WHERE id = ?').run(id)
    this.touchSpace(attempt.spaceId)
  }

  setPrimaryAttempt(spaceId: string, attemptId: string): SpaceAttempt {
    this.assertSpaceExists(spaceId)
    const attempt = this.getAttemptById(attemptId)
    if (!attempt || attempt.spaceId !== spaceId) {
      throw new Error(`Space attempt not found: ${attemptId}`)
    }

    const setPrimary = this.db.transaction(() => {
      this.clearPrimaryAttempts(spaceId)
      this.db
        .prepare('UPDATE space_attempts SET is_primary = 1 WHERE id = ?')
        .run(attemptId)
      this.touchSpace(spaceId)
    })

    setPrimary()
    return this.getAttemptById(attemptId)!
  }

  listArtifacts(spaceId: string): SpaceArtifact[] {
    this.assertSpaceExists(spaceId)
    const rows = this.db
      .prepare(
        `SELECT * FROM space_artifacts
         WHERE space_id = ?
         ORDER BY created_at DESC`,
      )
      .all(spaceId) as SpaceArtifactRow[]

    return rows.map(spaceArtifactFromRow)
  }

  addArtifact(input: CreateSpaceArtifactInput): SpaceArtifact {
    this.assertSpaceExists(input.spaceId)
    if (input.sourceSessionId) {
      this.assertSessionExists(input.sourceSessionId)
    }

    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO space_artifacts (
           id, space_id, kind, label, value, source_session_id, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.spaceId,
        input.kind,
        normalizeRequiredText(input.label, 'Artifact label'),
        normalizeRequiredText(input.value, 'Artifact value'),
        input.sourceSessionId ?? null,
        input.status ?? 'planned',
      )
    this.touchSpace(input.spaceId)

    return this.getArtifactById(id)!
  }

  updateArtifact(id: string, input: UpdateSpaceArtifactInput): SpaceArtifact {
    const existing = this.getArtifactById(id)
    if (!existing) throw new Error(`Space artifact not found: ${id}`)
    if (input.sourceSessionId) {
      this.assertSessionExists(input.sourceSessionId)
    }

    this.db
      .prepare(
        `UPDATE space_artifacts
         SET kind = ?,
             label = ?,
             value = ?,
             source_session_id = ?,
             status = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        input.kind ?? existing.kind,
        input.label === undefined
          ? existing.label
          : normalizeRequiredText(input.label, 'Artifact label'),
        input.value === undefined
          ? existing.value
          : normalizeRequiredText(input.value, 'Artifact value'),
        input.sourceSessionId === undefined
          ? existing.sourceSessionId
          : input.sourceSessionId,
        input.status ?? existing.status,
        id,
      )
    this.touchSpace(existing.spaceId)

    return this.getArtifactById(id)!
  }

  deleteArtifact(id: string): void {
    const existing = this.getArtifactById(id)
    if (!existing) return
    this.db.prepare('DELETE FROM space_artifacts WHERE id = ?').run(id)
    this.touchSpace(existing.spaceId)
  }

  private getSpaceRow(id: string): SpaceRow | null {
    const row = this.db.prepare('SELECT * FROM spaces WHERE id = ?').get(id) as
      | SpaceRow
      | undefined
    return row ?? null
  }

  private getAttemptById(id: string): SpaceAttempt | null {
    const row = this.db
      .prepare('SELECT * FROM space_attempts WHERE id = ?')
      .get(id) as SpaceAttemptRow | undefined
    return row ? spaceAttemptFromRow(row) : null
  }

  private getArtifactById(id: string): SpaceArtifact | null {
    const row = this.db
      .prepare('SELECT * FROM space_artifacts WHERE id = ?')
      .get(id) as SpaceArtifactRow | undefined
    return row ? spaceArtifactFromRow(row) : null
  }

  private assertSpaceExists(id: string): void {
    if (!this.getSpaceRow(id)) {
      throw new Error(`Space not found: ${id}`)
    }
  }

  private assertSessionExists(id: string): void {
    const session = this.db
      .prepare('SELECT id FROM sessions WHERE id = ?')
      .get(id) as { id: string } | undefined
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }
  }

  private clearPrimaryAttempts(spaceId: string): void {
    this.db
      .prepare('UPDATE space_attempts SET is_primary = 0 WHERE space_id = ?')
      .run(spaceId)
  }

  private touchSpace(id: string): void {
    this.db
      .prepare("UPDATE spaces SET updated_at = datetime('now') WHERE id = ?")
      .run(id)
  }
}
