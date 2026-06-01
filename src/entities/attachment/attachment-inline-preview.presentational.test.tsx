import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Attachment } from './attachment.types'
import { AttachmentInlinePreview } from './attachment-inline-preview.presentational'

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1',
    sessionId: 'session-1',
    kind: 'image',
    mimeType: 'image/png',
    filename: 'screen.png',
    sizeBytes: 1024,
    storagePath: '/tmp/full-screen.png',
    thumbnailPath: null,
    textPreview: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('AttachmentInlinePreview', () => {
  it('renders an image preview that opens the full attachment', () => {
    const attachment = makeAttachment()
    const onOpen = vi.fn()

    render(<AttachmentInlinePreview attachment={attachment} onOpen={onOpen} />)

    const image = screen.getByRole('img', { name: 'screen.png' })
    expect(image).toHaveAttribute('src', 'file:///tmp/full-screen.png')
    expect(image).toHaveClass('object-contain')

    fireEvent.click(screen.getByRole('button', { name: /Preview screen\.png/ }))
    expect(onOpen).toHaveBeenCalledWith(attachment)
  })

  it('prefers thumbnailPath when available', () => {
    render(
      <AttachmentInlinePreview
        attachment={makeAttachment({ thumbnailPath: '/tmp/thumb-screen.png' })}
        onOpen={vi.fn()}
      />,
    )

    expect(screen.getByRole('img', { name: 'screen.png' })).toHaveAttribute(
      'src',
      'file:///tmp/thumb-screen.png',
    )
  })

  it('does not render for non-image attachments', () => {
    const { container } = render(
      <AttachmentInlinePreview
        attachment={makeAttachment({
          kind: 'pdf',
          mimeType: 'application/pdf',
          filename: 'doc.pdf',
        })}
        onOpen={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
