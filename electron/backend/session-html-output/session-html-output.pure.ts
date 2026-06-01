import { isAbsolute, normalize } from 'path'
import type { SessionHtmlOutputRow } from '../database/database.types'
import type {
  SessionHtmlOutput,
  SessionHtmlOutputKind,
  SessionHtmlOutputStatus,
} from './session-html-output.types'

export function rowToSessionHtmlOutput(
  row: SessionHtmlOutputRow,
): SessionHtmlOutput {
  return {
    id: row.id,
    sessionId: row.session_id,
    sourceItemId: row.source_item_id,
    kind: parseKind(row.output_kind),
    status: parseStatus(row.status),
    relativePath: row.relative_path,
    sizeBytes: row.size_bytes,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function defaultHtmlOutputRelativePath(
  kind: SessionHtmlOutputKind,
  sourceItemId?: string | null,
): string {
  if (kind === 'living') return 'index.html'
  const slug = sourceItemId?.trim() || 'unlinked'
  return `snapshots/${sanitizePathSegment(slug)}.html`
}

export function normalizeSessionHtmlRelativePath(value: string): string {
  if (!value.trim()) {
    throw new Error('HTML output relative path is required')
  }

  if (value.includes('\0')) {
    throw new Error('HTML output relative path contains an invalid character')
  }

  if (value.includes('\\')) {
    throw new Error('HTML output relative path must use forward slashes')
  }

  if (isAbsolute(value)) {
    throw new Error('HTML output relative path must not be absolute')
  }

  const normalized = normalize(value).replace(/\\/g, '/')
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error('HTML output relative path must stay within the session')
  }

  if (!normalized.endsWith('.html')) {
    throw new Error('HTML output relative path must end with .html')
  }

  return normalized
}

function parseKind(value: string): SessionHtmlOutputKind {
  return value === 'snapshot' ? 'snapshot' : 'living'
}

function parseStatus(value: string): SessionHtmlOutputStatus {
  if (value === 'pending' || value === 'failed') return value
  return 'ready'
}

function sanitizePathSegment(value: string): string {
  return (
    value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
  )
}
