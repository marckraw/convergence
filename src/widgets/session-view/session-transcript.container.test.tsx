import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ConversationItem, Session } from '@/entities/session'
import { useAttachmentStore } from '@/entities/attachment'
import { SessionTranscript } from './session-transcript.container'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number
    estimateSize: (index: number) => number
    getItemKey?: (index: number) => string | number | bigint
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: options.getItemKey?.(index) ?? index,
        start: index * options.estimateSize(index),
      })),
    getTotalSize: () =>
      Array.from({ length: options.count }, (_, index) =>
        options.estimateSize(index),
      ).reduce((total, size) => total + size, 0),
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}))

const baseSession: Session = {
  id: 'session-1',
  contextKind: 'project',
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'Test session',
  status: 'running',
  attention: 'none',
  activity: null,
  workingDirectory: '/tmp/project',
  contextWindow: null,
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function userMessage(overrides: {
  id: string
  sequence: number
  text: string
  turnId?: string
}): ConversationItem {
  return {
    id: overrides.id,
    sessionId: 'session-1',
    sequence: overrides.sequence,
    turnId: overrides.turnId ?? `turn-${overrides.sequence}`,
    kind: 'message',
    actor: 'user',
    text: overrides.text,
    state: 'complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: 'user',
    },
  }
}

function approvalRequest(overrides: {
  id: string
  sequence: number
}): ConversationItem {
  return {
    id: overrides.id,
    sessionId: 'session-1',
    sequence: overrides.sequence,
    turnId: `turn-${overrides.sequence}`,
    kind: 'approval-request',
    description: 'Allow file edit?',
    state: 'complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: 'approval',
    },
  }
}

describe('SessionTranscript', () => {
  it('renders conversation rows through the virtual transcript surface', async () => {
    useAttachmentStore.setState({ resolved: {} })

    render(
      <SessionTranscript
        session={baseSession}
        conversationItems={[
          userMessage({ id: 'message-1', sequence: 1, text: 'First turn' }),
          userMessage({ id: 'message-2', sequence: 2, text: 'Second turn' }),
        ]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(
      screen.getByTestId('session-transcript-scroll-region'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByTestId('session-transcript-row')).toHaveLength(2)
    })
    expect(screen.getByText('First turn')).toBeInTheDocument()
    expect(screen.getByText('Second turn')).toBeInTheDocument()
    expect(screen.getByText('Turn 1')).toBeInTheDocument()
    expect(screen.getByText('Turn 2')).toBeInTheDocument()
  })

  it('keeps the latest approval request actionable', async () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()

    render(
      <SessionTranscript
        session={{
          ...baseSession,
          attention: 'needs-approval',
        }}
        conversationItems={[approvalRequest({ id: 'approval-1', sequence: 1 })]}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))

    expect(onApprove).toHaveBeenCalledWith('session-1')
    expect(onDeny).toHaveBeenCalledWith('session-1')
  })
})
