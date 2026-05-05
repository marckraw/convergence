import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ConversationItem, Session } from '@/entities/session'
import { useSessionStore } from '@/entities/session'
import type { ComposerSessionContext } from '@/features/composer'
import { ChatSurface } from './chat-surface.container'

vi.mock('@/features/composer', () => ({
  ComposerContainer: ({ context }: { context: ComposerSessionContext }) => (
    <div data-testid="composer">
      {context.kind}:{context.activeSessionId ?? 'new'}
    </div>
  ),
}))

vi.mock('@/widgets/session-view', () => ({
  SessionConversationSurface: ({
    session,
    conversationItems,
    composerContext,
  }: {
    session: Session
    conversationItems: ConversationItem[]
    composerContext: ComposerSessionContext
  }) => (
    <div data-testid="conversation-surface">
      {session.name}:{conversationItems.length}:{composerContext.kind}
    </div>
  ),
}))

const globalSession: Session = {
  id: 'global-session-1',
  contextKind: 'global',
  projectId: null,
  workspaceId: null,
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'Planning chat',
  status: 'completed',
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

describe('ChatSurface', () => {
  beforeEach(() => {
    useSessionStore.setState({
      globalChatSessions: [],
      activeGlobalSessionId: null,
      activeGlobalConversation: [],
      activeGlobalConversationSessionId: null,
      approveSession: vi.fn(),
      denySession: vi.fn(),
      stopSession: vi.fn(),
    })
  })

  it('renders a project-free new chat composer when no global session is active', () => {
    render(<ChatSurface />)

    expect(screen.getByText('Convergence Chat')).toBeInTheDocument()
    expect(screen.getByTestId('composer')).toHaveTextContent('global:new')
  })

  it('renders the shared conversation surface for an active global session', () => {
    useSessionStore.setState({
      globalChatSessions: [globalSession],
      activeGlobalSessionId: globalSession.id,
      activeGlobalConversation: [
        {
          id: 'message-1',
          sessionId: globalSession.id,
          sequence: 1,
          turnId: 'turn-1',
          kind: 'message',
          actor: 'user',
          text: 'Hello',
          state: 'complete',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          providerMeta: {
            providerId: 'claude-code',
            providerItemId: null,
            providerEventType: 'user',
          },
        },
      ],
    })

    render(<ChatSurface />)

    expect(screen.getByText('Planning chat')).toBeInTheDocument()
    expect(screen.getByTestId('conversation-surface')).toHaveTextContent(
      'Planning chat:1:global',
    )
  })
})
