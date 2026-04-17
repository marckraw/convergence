import { describe, expect, it } from 'vitest'
import type { Attachment } from '@/entities/attachment'
import type { ProviderAttachmentCapability } from '@/entities/session'
import { validateAttachmentsAgainstCapability } from './attachment-capability.pure'

const CLAUDE: ProviderAttachmentCapability = {
  supportsImage: true,
  supportsPdf: true,
  supportsText: true,
  maxImageBytes: 10 * 1024 * 1024,
  maxPdfBytes: 20 * 1024 * 1024,
  maxTextBytes: 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
}

const CODEX: ProviderAttachmentCapability = {
  ...CLAUDE,
  supportsPdf: false,
  maxPdfBytes: 0,
}

function makeAttachment(partial: Partial<Attachment>): Attachment {
  return {
    id: partial.id ?? 'att-1',
    sessionId: 'session-1',
    kind: partial.kind ?? 'image',
    mimeType: partial.mimeType ?? 'image/png',
    filename: partial.filename ?? 'file.png',
    sizeBytes: partial.sizeBytes ?? 1024,
    storagePath: partial.storagePath ?? '/tmp/a',
    thumbnailPath: partial.thumbnailPath ?? null,
    textPreview: partial.textPreview ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
  }
}

describe('validateAttachmentsAgainstCapability', () => {
  it('passes when attachments are compatible and under caps', () => {
    const result = validateAttachmentsAgainstCapability(
      [
        makeAttachment({ id: 'a', kind: 'image', sizeBytes: 100 }),
        makeAttachment({ id: 'b', kind: 'pdf', sizeBytes: 200 }),
      ],
      CLAUDE,
    )

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects PDFs on providers without PDF support', () => {
    const result = validateAttachmentsAgainstCapability(
      [makeAttachment({ id: 'a', kind: 'pdf', sizeBytes: 100 })],
      CODEX,
    )

    expect(result.ok).toBe(false)
    expect(result.errorByAttachmentId['a']).toMatch(/PDF/)
  })

  it('rejects when an image exceeds the per-image cap', () => {
    const result = validateAttachmentsAgainstCapability(
      [
        makeAttachment({
          id: 'a',
          kind: 'image',
          sizeBytes: CLAUDE.maxImageBytes + 1,
        }),
      ],
      CLAUDE,
    )

    expect(result.ok).toBe(false)
    expect(result.errorByAttachmentId['a']).toMatch(/limit/)
  })

  it('rejects when total bytes exceed the per-message cap', () => {
    const half = Math.floor(CLAUDE.maxTotalBytes / 2) + 1
    const result = validateAttachmentsAgainstCapability(
      [
        makeAttachment({ id: 'a', kind: 'image', sizeBytes: half }),
        makeAttachment({ id: 'b', kind: 'image', sizeBytes: half }),
      ],
      CLAUDE,
    )

    expect(result.ok).toBe(false)
    expect(result.exceedsTotal).toBe(true)
  })

  it('returns ok for an empty list regardless of capability', () => {
    const result = validateAttachmentsAgainstCapability([], CODEX)
    expect(result.ok).toBe(true)
    expect(result.exceedsTotal).toBe(false)
  })

  it('rejects all attachments when capability is missing', () => {
    const result = validateAttachmentsAgainstCapability(
      [makeAttachment({ id: 'a', kind: 'image' })],
      null,
    )
    expect(result.ok).toBe(false)
    expect(result.errorByAttachmentId['a']).toMatch(/No provider/)
  })

  it('reports multiple errors across mixed kinds', () => {
    const result = validateAttachmentsAgainstCapability(
      [
        makeAttachment({ id: 'a', kind: 'pdf', sizeBytes: 100 }),
        makeAttachment({
          id: 'b',
          kind: 'image',
          sizeBytes: CODEX.maxImageBytes + 1,
        }),
        makeAttachment({ id: 'c', kind: 'text', sizeBytes: 100 }),
      ],
      CODEX,
    )

    expect(result.ok).toBe(false)
    expect(Object.keys(result.errorByAttachmentId).sort()).toEqual(['a', 'b'])
  })
})
