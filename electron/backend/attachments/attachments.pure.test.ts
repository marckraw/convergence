import { describe, expect, it } from 'vitest'
import {
  extensionFor,
  limitFor,
  limitLabel,
  rowToAttachment,
  sanitizeFilename,
} from './attachments.pure'
import {
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_TEXT_BYTES,
} from './attachments.constants'

describe('sanitizeFilename', () => {
  it('keeps only the basename and replaces unsafe characters', () => {
    expect(sanitizeFilename('../../etc/sec ret?.txt')).toBe('sec_ret_.txt')
    expect(sanitizeFilename('nested\\path\\file name.md')).toBe('file_name.md')
  })

  it('falls back when the sanitized name is empty', () => {
    expect(sanitizeFilename('')).toBe('attachment')
    expect(sanitizeFilename('////')).toBe('attachment')
  })

  it('caps filenames at 200 characters', () => {
    expect(sanitizeFilename('a'.repeat(250))).toHaveLength(200)
  })
})

describe('extensionFor', () => {
  it('prefers known mime extensions over the filename', () => {
    expect(extensionFor('image/jpeg', 'photo.png')).toBe('.jpg')
    expect(extensionFor('text/x-typescript', 'source.txt')).toBe('.ts')
  })

  it('falls back to the filename extension for unknown mime types', () => {
    expect(extensionFor('application/octet-stream', 'archive.tar.gz')).toBe(
      '.gz',
    )
    expect(extensionFor('application/octet-stream', 'Makefile')).toBe('')
  })
})

describe('limitFor and limitLabel', () => {
  it('returns byte caps by attachment kind', () => {
    expect(limitFor('image')).toBe(MAX_IMAGE_BYTES)
    expect(limitFor('pdf')).toBe(MAX_PDF_BYTES)
    expect(limitFor('text')).toBe(MAX_TEXT_BYTES)
  })

  it('returns user-facing cap labels by attachment kind', () => {
    expect(limitLabel('image')).toBe('10 MB')
    expect(limitLabel('pdf')).toBe('20 MB')
    expect(limitLabel('text')).toBe('1 MB')
  })
})

describe('rowToAttachment', () => {
  it('maps database row field names to the attachment contract', () => {
    expect(
      rowToAttachment({
        id: 'att-1',
        session_id: 'session-1',
        kind: 'text',
        mime_type: 'text/plain',
        filename: 'note.txt',
        size_bytes: 12,
        storage_path: '/tmp/note.txt',
        thumbnail_path: null,
        text_preview: 'hello',
        created_at: '2026-05-28T12:00:00.000Z',
      }),
    ).toEqual({
      id: 'att-1',
      sessionId: 'session-1',
      kind: 'text',
      mimeType: 'text/plain',
      filename: 'note.txt',
      sizeBytes: 12,
      storagePath: '/tmp/note.txt',
      thumbnailPath: null,
      textPreview: 'hello',
      createdAt: '2026-05-28T12:00:00.000Z',
    })
  })
})
