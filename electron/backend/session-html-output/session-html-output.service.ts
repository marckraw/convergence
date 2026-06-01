import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import type Database from 'better-sqlite3'
import type { SessionHtmlOutputRow } from '../database/database.types'
import {
  defaultHtmlOutputRelativePath,
  normalizeSessionHtmlRelativePath,
  rowToSessionHtmlOutput,
} from './session-html-output.pure'
import type {
  RecordSessionHtmlOutputFailureInput,
  SaveSessionHtmlOutputInput,
  SessionHtmlOutput,
  SessionHtmlOutputKind,
} from './session-html-output.types'

export class SessionHtmlOutputService {
  constructor(
    private readonly db: Database.Database,
    private readonly rootDir: string,
  ) {}

  async saveHtml(
    input: SaveSessionHtmlOutputInput,
  ): Promise<SessionHtmlOutput> {
    const relativePath = normalizeSessionHtmlRelativePath(
      input.relativePath ??
        defaultHtmlOutputRelativePath(input.kind, input.sourceItemId),
    )
    const absolutePath = this.resolveOutputPath(input.sessionId, relativePath)
    await fs.mkdir(dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, input.html, 'utf8')

    const existing = this.findExistingOutput(
      input.sessionId,
      input.kind,
      input.sourceItemId ?? null,
    )
    const id = existing?.id ?? randomUUID()
    const now = new Date().toISOString()
    const createdAt = existing?.created_at ?? now
    const sizeBytes = Buffer.byteLength(input.html, 'utf8')

    this.db
      .prepare(
        `INSERT INTO session_html_outputs (
          id,
          session_id,
          source_item_id,
          output_kind,
          status,
          relative_path,
          size_bytes,
          error,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, 'ready', ?, ?, NULL, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_item_id = excluded.source_item_id,
          output_kind = excluded.output_kind,
          status = excluded.status,
          relative_path = excluded.relative_path,
          size_bytes = excluded.size_bytes,
          error = excluded.error,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        input.sessionId,
        input.sourceItemId ?? null,
        input.kind,
        relativePath,
        sizeBytes,
        createdAt,
        now,
      )

    const output = this.getById(id)
    if (!output) throw new Error(`HTML output was not persisted: ${id}`)
    return output
  }

  recordFailure(input: RecordSessionHtmlOutputFailureInput): SessionHtmlOutput {
    const existing = this.findExistingOutput(
      input.sessionId,
      input.kind,
      input.sourceItemId ?? null,
    )
    const id = existing?.id ?? randomUUID()
    const now = new Date().toISOString()
    const createdAt = existing?.created_at ?? now

    this.db
      .prepare(
        `INSERT INTO session_html_outputs (
          id,
          session_id,
          source_item_id,
          output_kind,
          status,
          relative_path,
          size_bytes,
          error,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, 'failed', NULL, 0, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_item_id = excluded.source_item_id,
          output_kind = excluded.output_kind,
          status = excluded.status,
          relative_path = excluded.relative_path,
          size_bytes = excluded.size_bytes,
          error = excluded.error,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        input.sessionId,
        input.sourceItemId ?? null,
        input.kind,
        input.error,
        createdAt,
        now,
      )

    const output = this.getById(id)
    if (!output) throw new Error(`HTML output failure was not persisted: ${id}`)
    return output
  }

  listForSession(sessionId: string): SessionHtmlOutput[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM session_html_outputs
         WHERE session_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(sessionId) as SessionHtmlOutputRow[]

    return rows.map(rowToSessionHtmlOutput)
  }

  getById(id: string): SessionHtmlOutput | null {
    const row = this.db
      .prepare('SELECT * FROM session_html_outputs WHERE id = ?')
      .get(id) as SessionHtmlOutputRow | undefined

    return row ? rowToSessionHtmlOutput(row) : null
  }

  async readHtml(id: string): Promise<string> {
    const output = this.getById(id)
    if (!output) throw new Error(`HTML output not found: ${id}`)
    if (output.status !== 'ready' || !output.relativePath) {
      throw new Error(`HTML output is not ready: ${id}`)
    }

    return fs.readFile(
      this.resolveOutputPath(output.sessionId, output.relativePath),
      'utf8',
    )
  }

  getAbsolutePath(id: string): string {
    const output = this.getById(id)
    if (!output) throw new Error(`HTML output not found: ${id}`)
    if (output.status !== 'ready' || !output.relativePath) {
      throw new Error(`HTML output is not ready: ${id}`)
    }

    return this.resolveOutputPath(output.sessionId, output.relativePath)
  }

  async deleteForSession(sessionId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM session_html_outputs WHERE session_id = ?')
      .run(sessionId)
    await fs.rm(this.sessionHtmlRoot(sessionId), {
      recursive: true,
      force: true,
    })
  }

  async sweepOrphans(liveSessionIds: Iterable<string>): Promise<number> {
    const live = new Set(liveSessionIds)

    if (live.size > 0) {
      const placeholders = Array.from(live, () => '?').join(',')
      this.db
        .prepare(
          `DELETE FROM session_html_outputs WHERE session_id NOT IN (${placeholders})`,
        )
        .run(...Array.from(live))
    } else {
      this.db.prepare('DELETE FROM session_html_outputs').run()
    }

    let removed = 0
    let entries: string[]
    try {
      entries = await fs.readdir(this.rootDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
      throw error
    }

    for (const entry of entries) {
      if (live.has(entry)) continue
      await fs.rm(join(this.rootDir, entry), { recursive: true, force: true })
      removed += 1
    }

    return removed
  }

  private findExistingOutput(
    sessionId: string,
    kind: SessionHtmlOutputKind,
    sourceItemId: string | null,
  ): SessionHtmlOutputRow | null {
    if (kind === 'living') {
      return (
        (this.db
          .prepare(
            `SELECT *
             FROM session_html_outputs
             WHERE session_id = ? AND output_kind = 'living'
             LIMIT 1`,
          )
          .get(sessionId) as SessionHtmlOutputRow | undefined) ?? null
      )
    }

    if (!sourceItemId) return null

    return (
      (this.db
        .prepare(
          `SELECT *
           FROM session_html_outputs
           WHERE session_id = ? AND source_item_id = ? AND output_kind = 'snapshot'
           LIMIT 1`,
        )
        .get(sessionId, sourceItemId) as SessionHtmlOutputRow | undefined) ??
      null
    )
  }

  private sessionHtmlRoot(sessionId: string): string {
    return join(this.rootDir, sessionId, 'html')
  }

  private resolveOutputPath(sessionId: string, relativePath: string): string {
    const normalized = normalizeSessionHtmlRelativePath(relativePath)
    const root = resolve(this.sessionHtmlRoot(sessionId))
    const target = resolve(root, normalized)
    const relativeToRoot = relative(root, target)

    if (relativeToRoot === '' || relativeToRoot.startsWith('..')) {
      throw new Error('HTML output path must stay within the session')
    }

    return target
  }
}
