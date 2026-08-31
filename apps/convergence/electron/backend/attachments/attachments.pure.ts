import { extname } from 'path'
import type { Attachment, AttachmentKind } from './attachments.types'
import {
  EXTENSION_BY_MIME,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_TEXT_BYTES,
} from './attachments.constants'

export interface AttachmentRow {
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

export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name
  const trimmed = base.replace(/\s+/g, '_')
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_')
  return sanitized.length > 0 ? sanitized.slice(0, 200) : 'attachment'
}

export function extensionFor(mimeType: string, filename: string): string {
  const fromMime = EXTENSION_BY_MIME[mimeType]
  if (fromMime) return fromMime
  const fromName = extname(filename)
  return fromName || ''
}

export function limitFor(kind: AttachmentKind): number {
  if (kind === 'image') return MAX_IMAGE_BYTES
  if (kind === 'pdf') return MAX_PDF_BYTES
  return MAX_TEXT_BYTES
}

export function limitLabel(kind: AttachmentKind): string {
  if (kind === 'image') return '10 MB'
  if (kind === 'pdf') return '20 MB'
  return '1 MB'
}

export function rowToAttachment(row: AttachmentRow): Attachment {
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
