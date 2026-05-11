import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ConversationItem, Session } from '@/entities/session'
import type { ComposerSessionContext } from '@/features/composer'
import { SessionConversationSurface } from './session-conversation-surface.container'

vi.mock('@/features/composer', () => ({
  ComposerContainer: ({ context }: { context: ComposerSessionContext }) => (
    <div data-testid="composer">
      {context.kind}:{context.activeSessionId ?? 'new'}
    </div>
  ),
}))

vi.mock('./session-transcript.container', () => ({
  SessionTranscript: ({
    session,
    conversationItems,
    onUiResponseArtifactSelect,
  }: {
    session: Session
    conversationItems: ConversationItem[]
    onUiResponseArtifactSelect?: (conversationItemId: string) => void
  }) => (
    <div data-testid="transcript">
      {session.name}:{conversationItems.length}
      {conversationItems.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onUiResponseArtifactSelect?.(item.id)}
        >
          select {item.id}
        </button>
      ))}
    </div>
  ),
}))

const baseSession: Session = {
  id: 'session-1',
  contextKind: 'global',
  projectId: null,
  workspaceId: null,
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'Global chat',
  status: 'running',
  attention: 'none',
  activity: null,
  workingDirectory: '/tmp/convergence/global',
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

describe('SessionConversationSurface', () => {
  it('renders the reusable transcript and composer for a global session', () => {
    render(
      <SessionConversationSurface
        session={baseSession}
        conversationItems={[]}
        composerContext={{ kind: 'global', activeSessionId: 'session-1' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByTestId('transcript')).toHaveTextContent('Global chat:0')
    expect(screen.getByTestId('composer')).toHaveTextContent('global:session-1')
    expect(screen.queryByTestId('session-ui-response-split')).toBeNull()
  })

  it('renders a disabled composer reason instead of composer controls', () => {
    render(
      <SessionConversationSurface
        session={baseSession}
        conversationItems={[]}
        composerContext={{ kind: 'global', activeSessionId: 'session-1' }}
        composerDisabledReason="Conversation input is disabled."
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByText('Conversation input is disabled.')).toBeVisible()
    expect(screen.queryByTestId('composer')).toBeNull()
  })

  it('splits the session surface when the latest assistant response has a UI artifact', () => {
    render(
      <SessionConversationSurface
        session={baseSession}
        conversationItems={[
          {
            id: 'message-1',
            sessionId: 'session-1',
            sequence: 1,
            turnId: 'turn-1',
            kind: 'message',
            actor: 'assistant',
            state: 'complete',
            text: [
              'Markdown answer.',
              '',
              '```convergence-ui-html',
              '---',
              'title: Preview panel',
              '---',
              '<main>Generated UI</main>',
              '```',
            ].join('\n'),
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            providerMeta: {
              providerId: 'codex',
              providerItemId: null,
              providerEventType: 'assistant',
            },
          },
        ]}
        composerContext={{ kind: 'global', activeSessionId: 'session-1' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByTestId('session-ui-response-split')).toBeInTheDocument()
    expect(screen.getByTestId('transcript')).toHaveTextContent('Global chat:1')
    expect(screen.getByTestId('ui-response-panel')).toBeInTheDocument()
    expect(screen.getByText('Preview panel')).toBeInTheDocument()
  })

  it('renders the selected assistant UI artifact when a transcript turn is selected', () => {
    render(
      <SessionConversationSurface
        session={baseSession}
        conversationItems={[
          assistantArtifactMessage({
            id: 'message-1',
            sequence: 1,
            title: 'First preview',
          }),
          assistantArtifactMessage({
            id: 'message-2',
            sequence: 2,
            title: 'Second preview',
          }),
        ]}
        composerContext={{ kind: 'global', activeSessionId: 'session-1' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByText('Second preview')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'select message-1' }))

    expect(screen.getByText('First preview')).toBeInTheDocument()
  })
})

function assistantArtifactMessage(input: {
  id: string
  sequence: number
  title: string
}): ConversationItem {
  return {
    id: input.id,
    sessionId: 'session-1',
    sequence: input.sequence,
    turnId: `turn-${input.sequence}`,
    kind: 'message',
    actor: 'assistant',
    state: 'complete',
    text: [
      'Markdown answer.',
      '',
      '```convergence-ui-html',
      '---',
      `title: ${input.title}`,
      '---',
      `<main>${input.title}</main>`,
      '```',
    ].join('\n'),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'codex',
      providerItemId: null,
      providerEventType: 'assistant',
    },
  }
}
