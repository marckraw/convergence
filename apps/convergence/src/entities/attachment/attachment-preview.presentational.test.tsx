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

    // How it fits (contained, never cropped, within the window) is drawn
    // and measured in its stories: attachment-preview.stories.tsx, Tall.
    expect(screen.getByRole('img', { name: 'vertical.png' })).toHaveAttribute(
      'src',
      'blob:vertical-image',
    )
  })

  it('says why a file cannot be read, as an alert', () => {
    render(
      <AttachmentPreview
        attachment={makeAttachment()}
        objectUrl={null}
        textContent={null}
        isLoading={false}
        error="The attachment file could not be read."
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The attachment file could not be read.',
    )
    expect(screen.queryByRole('img')).toBeNull()
  })
})
