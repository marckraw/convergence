import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type {
  InitiativeAttemptRow,
  InitiativeOutputRow,
  InitiativeRow,
} from '../database/database.types'
import {
  initiativeAttemptFromRow,
  initiativeFromRow,
  initiativeOutputFromRow,
  type CreateInitiativeInput,
  type CreateInitiativeOutputInput,
  type Initiative,
  type InitiativeAttempt,
  type InitiativeOutput,
  type LinkInitiativeAttemptInput,
  type UpdateInitiativeAttemptInput,
  type UpdateInitiativeInput,
  type UpdateInitiativeOutputInput,
} from './initiative.types'
import { normalizeOptionalText, normalizeRequiredText } from './initiative.pure'

export class InitiativeService {
  constructor(private db: Database.Database) {}

  list(): Initiative[] {
    const rows = this.db
      .prepare('SELECT * FROM initiatives ORDER BY updated_at DESC')
      .all() as InitiativeRow[]

    return rows.map(initiativeFromRow)
  }

  getById(id: string): Initiative | null {
    const row = this.getInitiativeRow(id)
    return row ? initiativeFromRow(row) : null
  }

  create(input: CreateInitiativeInput): Initiative {
    const id = randomUUID()
    const title = normalizeRequiredText(input.title, 'Initiative title')
    const currentUnderstanding = normalizeOptionalText(
      input.currentUnderstanding,
    )

    this.db
      .prepare(
        `INSERT INTO initiatives (
           id, title, status, attention, current_understanding
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        title,
        input.status ?? 'exploring',
        input.attention ?? 'none',
        currentUnderstanding,
      )

    return this.getById(id)!
  }

  update(id: string, input: UpdateInitiativeInput): Initiative {
    if (!this.getInitiativeRow(id)) {
      throw new Error(`Initiative not found: ${id}`)
    }

    const existing = this.getById(id)!
    const title =
      input.title === undefined
        ? existing.title
        : normalizeRequiredText(input.title, 'Initiative title')
    const currentUnderstanding =
      input.currentUnderstanding === undefined
        ? existing.currentUnderstanding
        : input.currentUnderstanding.trim()

    this.db
      .prepare(
        `UPDATE initiatives
         SET title = ?,
             status = ?,
             attention = ?,
             current_understanding = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        title,
        input.status ?? existing.status,
        input.attention ?? existing.attention,
        currentUnderstanding,
        id,
      )

    return this.getById(id)!
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM initiatives WHERE id = ?').run(id)
  }

  listAttempts(initiativeId: string): InitiativeAttempt[] {
    this.assertInitiativeExists(initiativeId)
    const rows = this.db
      .prepare(
        `SELECT * FROM initiative_attempts
         WHERE initiative_id = ?
         ORDER BY is_primary DESC, created_at ASC`,
      )
      .all(initiativeId) as InitiativeAttemptRow[]

    return rows.map(initiativeAttemptFromRow)
  }

  linkAttempt(input: LinkInitiativeAttemptInput): InitiativeAttempt {
    this.assertInitiativeExists(input.initiativeId)
    this.assertSessionExists(input.sessionId)

    const existing = this.db
      .prepare(
        `SELECT * FROM initiative_attempts
         WHERE initiative_id = ? AND session_id = ?`,
      )
      .get(input.initiativeId, input.sessionId) as
      | InitiativeAttemptRow
      | undefined

    if (existing) {
      throw new Error('Session is already linked to this Initiative')
    }

    const existingCount = (
      this.db
        .prepare(
          'SELECT COUNT(*) as count FROM initiative_attempts WHERE initiative_id = ?',
        )
        .get(input.initiativeId) as { count: number }
    ).count
    const isPrimary = input.isPrimary ?? existingCount === 0
    const id = randomUUID()

    const insert = this.db.transaction(() => {
      if (isPrimary) {
        this.clearPrimaryAttempts(input.initiativeId)
      }

      this.db
        .prepare(
          `INSERT INTO initiative_attempts (
             id, initiative_id, session_id, role, is_primary
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.initiativeId,
          input.sessionId,
          input.role ?? 'exploration',
          isPrimary ? 1 : 0,
        )
      this.touchInitiative(input.initiativeId)
    })

    insert()
    return this.getAttemptById(id)!
  }

  updateAttempt(
    id: string,
    input: UpdateInitiativeAttemptInput,
  ): InitiativeAttempt {
    const attempt = this.getAttemptById(id)
    if (!attempt) throw new Error(`Initiative attempt not found: ${id}`)

    this.db
      .prepare('UPDATE initiative_attempts SET role = ? WHERE id = ?')
      .run(input.role ?? attempt.role, id)
    this.touchInitiative(attempt.initiativeId)

    return this.getAttemptById(id)!
  }

  unlinkAttempt(id: string): void {
    const attempt = this.getAttemptById(id)
    if (!attempt) return
    this.db.prepare('DELETE FROM initiative_attempts WHERE id = ?').run(id)
    this.touchInitiative(attempt.initiativeId)
  }

  setPrimaryAttempt(
    initiativeId: string,
    attemptId: string,
  ): InitiativeAttempt {
    this.assertInitiativeExists(initiativeId)
    const attempt = this.getAttemptById(attemptId)
    if (!attempt || attempt.initiativeId !== initiativeId) {
      throw new Error(`Initiative attempt not found: ${attemptId}`)
    }

    const setPrimary = this.db.transaction(() => {
      this.clearPrimaryAttempts(initiativeId)
      this.db
        .prepare('UPDATE initiative_attempts SET is_primary = 1 WHERE id = ?')
        .run(attemptId)
      this.touchInitiative(initiativeId)
    })

    setPrimary()
    return this.getAttemptById(attemptId)!
  }

  listOutputs(initiativeId: string): InitiativeOutput[] {
    this.assertInitiativeExists(initiativeId)
    const rows = this.db
      .prepare(
        `SELECT * FROM initiative_outputs
         WHERE initiative_id = ?
         ORDER BY created_at DESC`,
      )
      .all(initiativeId) as InitiativeOutputRow[]

    return rows.map(initiativeOutputFromRow)
  }

  addOutput(input: CreateInitiativeOutputInput): InitiativeOutput {
    this.assertInitiativeExists(input.initiativeId)
    if (input.sourceSessionId) {
      this.assertSessionExists(input.sourceSessionId)
    }

    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO initiative_outputs (
           id, initiative_id, kind, label, value, source_session_id, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.initiativeId,
        input.kind,
        normalizeRequiredText(input.label, 'Output label'),
        normalizeRequiredText(input.value, 'Output value'),
        input.sourceSessionId ?? null,
        input.status ?? 'planned',
      )
    this.touchInitiative(input.initiativeId)

    return this.getOutputById(id)!
  }

  updateOutput(
    id: string,
    input: UpdateInitiativeOutputInput,
  ): InitiativeOutput {
    const existing = this.getOutputById(id)
    if (!existing) throw new Error(`Initiative output not found: ${id}`)
    if (input.sourceSessionId) {
      this.assertSessionExists(input.sourceSessionId)
    }

    this.db
      .prepare(
        `UPDATE initiative_outputs
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
          : normalizeRequiredText(input.label, 'Output label'),
        input.value === undefined
          ? existing.value
          : normalizeRequiredText(input.value, 'Output value'),
        input.sourceSessionId === undefined
          ? existing.sourceSessionId
          : input.sourceSessionId,
        input.status ?? existing.status,
        id,
      )
    this.touchInitiative(existing.initiativeId)

    return this.getOutputById(id)!
  }

  deleteOutput(id: string): void {
    const existing = this.getOutputById(id)
    if (!existing) return
    this.db.prepare('DELETE FROM initiative_outputs WHERE id = ?').run(id)
    this.touchInitiative(existing.initiativeId)
  }

  private getInitiativeRow(id: string): InitiativeRow | null {
    const row = this.db
      .prepare('SELECT * FROM initiatives WHERE id = ?')
      .get(id) as InitiativeRow | undefined
    return row ?? null
  }

  private getAttemptById(id: string): InitiativeAttempt | null {
    const row = this.db
      .prepare('SELECT * FROM initiative_attempts WHERE id = ?')
      .get(id) as InitiativeAttemptRow | undefined
    return row ? initiativeAttemptFromRow(row) : null
  }

  private getOutputById(id: string): InitiativeOutput | null {
    const row = this.db
      .prepare('SELECT * FROM initiative_outputs WHERE id = ?')
      .get(id) as InitiativeOutputRow | undefined
    return row ? initiativeOutputFromRow(row) : null
  }

  private assertInitiativeExists(id: string): void {
    if (!this.getInitiativeRow(id)) {
      throw new Error(`Initiative not found: ${id}`)
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

  private clearPrimaryAttempts(initiativeId: string): void {
    this.db
      .prepare(
        'UPDATE initiative_attempts SET is_primary = 0 WHERE initiative_id = ?',
      )
      .run(initiativeId)
  }

  private touchInitiative(id: string): void {
    this.db
      .prepare(
        "UPDATE initiatives SET updated_at = datetime('now') WHERE id = ?",
      )
      .run(id)
  }
}
