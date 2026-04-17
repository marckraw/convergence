import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { join, extname } from 'path'
import type Database from 'better-sqlite3'
import type {
  Attachment,
  AttachmentKind,
  IngestFileInput,
  IngestRejection,
  IngestResult,
} from './attachments.types'
import {
  isValidUtf8,
  mimeTypeForTextExtension,
  sniffMime,
} from './mime-sniff.pure'
import { normalizeImageBytes } from './image-normalize.pure'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_TEXT_BYTES = 1 * 1024 * 1024
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024

// Sentinel session id used by the composer when no real session exists yet
// (see `src/features/composer/composer.container.tsx` DRAFT_KEY_NEW).
// Attachments created with this id live under `{rootDir}/__new__/` until the
// session is created, at which point `rebindToSession` moves them into the
// real session directory. Must match the renderer sentinel.
export const DRAFT_SESSION_ID = '__new__'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'application/json': '.json',
  'text/x-typescript': '.ts',
  'text/javascript': '.js',
  'text/x-python': '.py',
  'text/x-ruby': '.rb',
  'text/x-go': '.go',
  'text/x-rust': '.rs',
  'text/x-java': '.java',
  'text/x-c': '.c',
  'text/x-c++': '.cpp',
  'application/x-sh': '.sh',
  'text/yaml': '.yml',
  'text/toml': '.toml',
  'text/xml': '.xml',
  'text/html': '.html',
  'text/css': '.css',
  'text/x-sql': '.sql',
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name
  const trimmed = base.replace(/\s+/g, '_')
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_')
  return sanitized.length > 0 ? sanitized.slice(0, 200) : 'attachment'
}

function extensionFor(mimeType: string, filename: string): string {
  const fromMime = EXTENSION_BY_MIME[mimeType]
  if (fromMime) return fromMime
  const fromName = extname(filename)
  return fromName || ''
}

function limitFor(kind: AttachmentKind): number {
  if (kind === 'image') return MAX_IMAGE_BYTES
  if (kind === 'pdf') return MAX_PDF_BYTES
  return MAX_TEXT_BYTES
}

function limitLabel(kind: AttachmentKind): string {
  if (kind === 'image') return '10 MB'
  if (kind === 'pdf') return '20 MB'
  return '1 MB'
}

interface AttachmentRow {
  id: string
  session_id: string
  kind: string
  mime_type: string
  filename: string
  size_bytes: number
  storage_path: string
  thumbnail_path: string | null
  text_preview: string | null
  created_at: string
}

function rowToAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind as AttachmentKind,
    mimeType: row.mime_type,
    filename: row.filename,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    thumbnailPath: row.thumbnail_path,
    textPreview: row.text_preview,
    createdAt: row.created_at,
  }
}

export class AttachmentsService {
  constructor(
    private db: Database.Database,
    private rootDir: string,
  ) {}

  async ingestFiles(
    sessionId: string,
    files: IngestFileInput[],
  ): Promise<IngestResult> {
    const attachments: Attachment[] = []
    const rejections: IngestRejection[] = []
    let totalBytes = 0

    for (const file of files) {
      const existing = attachments.reduce((a, b) => a + b.sizeBytes, 0)
      const remaining = MAX_TOTAL_BYTES - existing - totalBytes
      try {
        const attachment = await this.ingestOneFile(
          sessionId,
          file.name,
          file.bytes,
          file.mimeType,
          remaining,
        )
        attachments.push(attachment)
        totalBytes += attachment.sizeBytes
      } catch (error) {
        rejections.push({
          filename: file.name,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { attachments, rejections }
  }

  async ingestFromPaths(
    sessionId: string,
    paths: string[],
  ): Promise<IngestResult> {
    const files: IngestFileInput[] = []
    const rejections: IngestRejection[] = []

    for (const path of paths) {
      try {
        const data = await fs.readFile(path)
        const filename = path.split(/[/\\]/).pop() ?? path
        files.push({
          name: filename,
          bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        })
      } catch (error) {
        rejections.push({
          filename: path,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const result = await this.ingestFiles(sessionId, files)
    return {
      attachments: result.attachments,
      rejections: [...rejections, ...result.rejections],
    }
  }

  private async ingestOneFile(
    sessionId: string,
    rawFilename: string,
    rawBytes: Uint8Array,
    declaredMimeType: string | undefined,
    remainingBudget: number,
  ): Promise<Attachment> {
    if (rawBytes.length === 0) {
      throw new Error('Empty file rejected')
    }

    const filename = sanitizeFilename(rawFilename)

    const sniffed = sniffMime(rawBytes)
    let mimeType: string
    let kind: AttachmentKind

    if (sniffed) {
      mimeType = sniffed.mimeType
      kind = sniffed.kind
      if (kind === 'text') {
        const extMime = mimeTypeForTextExtension(rawFilename)
        if (extMime) mimeType = extMime
      }
    } else {
      throw new Error(
        `Unsupported file type for ${rawFilename} (not a recognized image, PDF, or UTF-8 text file)`,
      )
    }

    if (kind === 'text' && !isValidUtf8(rawBytes)) {
      throw new Error(`Text file ${rawFilename} is not valid UTF-8`)
    }

    const bytes =
      kind === 'image' ? normalizeImageBytes(rawBytes, mimeType) : rawBytes

    if (bytes.length > limitFor(kind)) {
      throw new Error(
        `${kind === 'pdf' ? 'PDF' : kind === 'image' ? 'Image' : 'Text file'} too large (cap ${limitLabel(kind)})`,
      )
    }

    if (bytes.length > remainingBudget) {
      throw new Error('Message attachments exceed 50 MB total')
    }

    if (declaredMimeType && declaredMimeType !== mimeType) {
      // sniff is authoritative; caller's declared type is advisory only
    }

    const id = randomUUID()
    const ext = extensionFor(mimeType, filename)
    const sessionDir = join(this.rootDir, sessionId)
    await fs.mkdir(sessionDir, { recursive: true })
    const storagePath = join(sessionDir, `${id}${ext}`)
    await fs.writeFile(storagePath, bytes)

    const textPreview =
      kind === 'text'
        ? new TextDecoder('utf-8').decode(bytes.subarray(0, 512))
        : null
    const createdAt = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO attachments (
          id, session_id, kind, mime_type, filename, size_bytes,
          storage_path, thumbnail_path, text_preview, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        sessionId,
        kind,
        mimeType,
        filename,
        bytes.length,
        storagePath,
        null,
        textPreview,
        createdAt,
      )

    return {
      id,
      sessionId,
      kind,
      mimeType,
      filename,
      sizeBytes: bytes.length,
      storagePath,
      thumbnailPath: null,
      textPreview,
      createdAt,
    }
  }

  getById(id: string): Attachment | null {
    const row = this.db
      .prepare('SELECT * FROM attachments WHERE id = ?')
      .get(id) as AttachmentRow | undefined
    return row ? rowToAttachment(row) : null
  }

  getForSession(sessionId: string): Attachment[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM attachments WHERE session_id = ? ORDER BY created_at ASC',
      )
      .all(sessionId) as AttachmentRow[]
    return rows.map(rowToAttachment)
  }

  getMany(ids: string[]): Attachment[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT * FROM attachments WHERE id IN (${placeholders})`)
      .all(...ids) as AttachmentRow[]
    const byId = new Map(rows.map((row) => [row.id, rowToAttachment(row)]))
    const out: Attachment[] = []
    for (const id of ids) {
      const att = byId.get(id)
      if (att) out.push(att)
    }
    return out
  }

  async readBytes(id: string): Promise<Uint8Array> {
    const attachment = this.getById(id)
    if (!attachment) throw new Error(`Attachment not found: ${id}`)
    const data = await fs.readFile(attachment.storagePath)
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }

  async delete(id: string): Promise<void> {
    const attachment = this.getById(id)
    if (!attachment) return
    this.db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
    await fs.rm(attachment.storagePath, { force: true })
    if (attachment.thumbnailPath) {
      await fs.rm(attachment.thumbnailPath, { force: true })
    }
  }

  async deleteForSession(sessionId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM attachments WHERE session_id = ?')
      .run(sessionId)
    const sessionDir = join(this.rootDir, sessionId)
    await fs.rm(sessionDir, { recursive: true, force: true })
  }

  async sweepOrphans(liveSessionIds: Iterable<string>): Promise<number> {
    const live = new Set(liveSessionIds)

    // Purge DB rows whose session_id is no longer live (includes draft rows
    // with session_id === DRAFT_SESSION_ID, since draft state lives in the
    // renderer Zustand store and does not survive restarts).
    if (live.size > 0) {
      const placeholders = Array.from(live, () => '?').join(',')
      this.db
        .prepare(
          `DELETE FROM attachments WHERE session_id NOT IN (${placeholders})`,
        )
        .run(...Array.from(live))
    } else {
      this.db.prepare('DELETE FROM attachments').run()
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
      const target = join(this.rootDir, entry)
      await fs.rm(target, { recursive: true, force: true })
      removed += 1
    }
    return removed
  }

  async rebindToSession(
    attachmentIds: string[],
    newSessionId: string,
  ): Promise<void> {
    if (attachmentIds.length === 0) return
    if (newSessionId === DRAFT_SESSION_ID) {
      throw new Error('rebindToSession requires a real session id')
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM attachments WHERE id IN (${attachmentIds.map(() => '?').join(',')})`,
      )
      .all(...attachmentIds) as AttachmentRow[]

    const toMove = rows.filter((row) => row.session_id !== newSessionId)
    if (toMove.length === 0) return

    const targetDir = join(this.rootDir, newSessionId)
    await fs.mkdir(targetDir, { recursive: true })

    const updateStmt = this.db.prepare(
      `UPDATE attachments
       SET session_id = ?, storage_path = ?, thumbnail_path = ?
       WHERE id = ?`,
    )

    for (const row of toMove) {
      const storageExt = extname(row.storage_path)
      const newStoragePath = join(targetDir, `${row.id}${storageExt}`)
      await moveFile(row.storage_path, newStoragePath)

      let newThumbPath: string | null = null
      if (row.thumbnail_path) {
        const thumbExt = extname(row.thumbnail_path)
        newThumbPath = join(targetDir, `${row.id}.thumb${thumbExt}`)
        await moveFile(row.thumbnail_path, newThumbPath)
      }

      updateStmt.run(newSessionId, newStoragePath, newThumbPath, row.id)
    }
  }
}

async function moveFile(from: string, to: string): Promise<void> {
  if (from === to) return
  try {
    await fs.rename(from, to)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
      await fs.copyFile(from, to)
      await fs.rm(from, { force: true })
      return
    }
    throw error
  }
}
