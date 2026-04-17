import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Attachment } from '@/entities/attachment'
import { AttachmentChip } from './attachment-chip.presentational'

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1',
    sessionId: 'session-1',
    kind: 'image',
    mimeType: 'image/png',
    filename: 'photo.png',
    sizeBytes: 1024,
    storagePath: '/tmp/a',
    thumbnailPath: null,
    textPreview: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('AttachmentChip', () => {
  it('renders filename and triggers onOpen on body click', () => {
    const onOpen = vi.fn()
    const onRemove = vi.fn()

    render(
      <AttachmentChip
        attachment={makeAttachment({ filename: 'photo.png' })}
        onOpen={onOpen}
        onRemove={onRemove}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Preview photo\.png/ }))
    expect(onOpen).toHaveBeenCalled()
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('calls onRemove with attachment id when × is clicked', () => {
    const onOpen = vi.fn()
    const onRemove = vi.fn()

    render(
      <AttachmentChip
        attachment={makeAttachment({ id: 'att-42' })}
        onOpen={onOpen}
        onRemove={onRemove}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    expect(onRemove).toHaveBeenCalledWith('att-42')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('applies destructive styling and tooltip when capabilityError is set', () => {
    render(
      <AttachmentChip
        attachment={makeAttachment({ kind: 'pdf', filename: 'doc.pdf' })}
        capabilityError="Provider does not accept PDFs"
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    const chip = screen.getByTestId('attachment-chip')
    expect(chip.className).toMatch(/border-destructive/)
    expect(
      screen.getByRole('button', { name: /Preview doc\.pdf/ }),
    ).toHaveAttribute('title', 'Provider does not accept PDFs')
  })
})
