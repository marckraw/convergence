import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAttachmentStore } from '@/entities/attachment'
import { ConversationItem } from './conversation-item.container'

describe('ConversationItem', () => {
  beforeEach(() => {
    useAttachmentStore.setState({ drafts: {}, resolved: {} })
  })

  it('renders before historical attachment metadata is hydrated', () => {
    render(
      <ConversationItem
        sessionId="session-1"
        entry={{
          id: 'message-1',
          sessionId: 'session-1',
          sequence: 1,
          turnId: null,
          kind: 'message',
          state: 'complete',
          actor: 'user',
          text: 'review this file',
          attachmentIds: ['attachment-1'],
          skillSelections: [],
          createdAt: '2026-04-13T10:00:00.000Z',
          updatedAt: '2026-04-13T10:00:00.000Z',
          providerMeta: {
            providerId: 'claude-code',
            providerItemId: null,
            providerEventType: 'user',
          },
        }}
      />,
    )

    expect(screen.getByText('review this file')).toBeInTheDocument()
    expect(screen.getByTestId('missing-attachment-chip')).toHaveAttribute(
      'data-attachment-id',
      'attachment-1',
    )
  })
})
