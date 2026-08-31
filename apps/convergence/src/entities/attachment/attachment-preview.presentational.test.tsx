import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Attachment } from './attachment.types'
import { AttachmentPreview } from './attachment-preview.presentational'

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1',
    sessionId: 'session-1',
    kind: 'image',
    mimeType: 'image/png',
    filename: 'vertical.png',
    sizeBytes: 1024,
    storagePath: '/tmp/a',
    thumbnailPath: null,
    textPreview: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('AttachmentPreview', () => {
  it('renders image previews in a contained viewport that preserves aspect ratio', () => {
    render(
      <AttachmentPreview
        attachment={makeAttachment()}
        objectUrl="blob:vertical-image"
        textContent={null}
        isLoading={false}
        error={null}
        onClose={vi.fn()}
      />,
    )

    const image = screen.getByRole('img', { name: 'vertical.png' })
    expect(image).toHaveClass('object-contain')
    expect(image).toHaveClass('max-h-[calc(100vh-8rem)]')
    expect(image).not.toHaveClass('object-cover')
  })
})
