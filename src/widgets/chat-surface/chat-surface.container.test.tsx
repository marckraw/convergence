import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type {
  ConversationItem,
  Session,
  SessionSummary,
} from '@/entities/session'
import { useSessionStore } from '@/entities/session'
import { useSpaceStore } from '@/entities/space'
import type { ComposerSessionContext } from '@/features/composer'
import { ChatSurface } from './chat-surface.container'

vi.mock('@/features/composer', () => ({
  ComposerContainer: ({
    context,
    onGlobalSessionCreated,
  }: {
    context: ComposerSessionContext
    onGlobalSessionCreated?: (session: SessionSummary) => void | Promise<void>
  }) => (
    <div data-testid="composer">
      <span>
        {context.kind}:{context.activeSessionId ?? 'new'}
      </span>
      {onGlobalSessionCreated ? (
        <button
          type="button"
          onClick={() =>
            onGlobalSessionCreated({
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
            })
          }
        >
          mock create attempt
        </button>
      ) : null}
    </div>
  ),
}))

vi.mock('@/features/command-center', () => ({
  switchToSession: vi.fn(),
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
    useSpaceStore.setState({
      spaces: [],
      attemptsBySpaceId: {},
      attemptsBySessionId: {},
      artifactsBySpaceId: {},
      loading: false,
      error: null,
    })
  })

  it('renders a project-free new chat composer when no global session is active', () => {
    render(<ChatSurface selectedSpaceId={null} />)

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

    render(<ChatSurface selectedSpaceId={null} />)

    expect(screen.getByText('Planning chat')).toBeInTheDocument()
    expect(screen.getByTestId('conversation-surface')).toHaveTextContent(
      'Planning chat:1:global',
    )
  })

  it('renders a selected Space home when no chat session is active', () => {
    useSpaceStore.setState({
      spaces: [
        {
          id: 'space-1',
          title: 'Launch plan',
          status: 'exploring',
          attention: 'none',
          brief: 'Coordinate the launch work.',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      attemptsBySpaceId: {
        'space-1': [
          {
            id: 'attempt-1',
            spaceId: 'space-1',
            sessionId: 'global-session-1',
            role: 'seed',
            isPrimary: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    })
    useSessionStore.setState({
      globalSessions: [globalSession],
      globalChatSessions: [globalSession],
    })

    render(<ChatSurface selectedSpaceId="space-1" />)

    expect(
      screen.getByRole('heading', { name: 'Launch plan' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /chats/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sources/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /memory/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /artifacts/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /brief/i })).toBeInTheDocument()
    expect(screen.getByText('Coordinate the launch work.')).toBeInTheDocument()
    expect(screen.getByText('Planning chat')).toBeInTheDocument()
  })

  it('links a newly created global session as a Space attempt', async () => {
    const linkAttempt = vi.fn().mockResolvedValue(null)
    const loadAttempts = vi.fn().mockResolvedValue(undefined)
    useSpaceStore.setState({
      spaces: [
        {
          id: 'space-1',
          title: 'Launch plan',
          status: 'exploring',
          attention: 'none',
          brief: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      attemptsBySpaceId: {},
      linkAttempt,
      loadAttempts,
      loadArtifacts: vi.fn().mockResolvedValue(undefined),
    })

    render(<ChatSurface selectedSpaceId="space-1" />)
    fireEvent.click(
      screen.getByRole('button', { name: /mock create attempt/i }),
    )

    await waitFor(() => {
      expect(linkAttempt).toHaveBeenCalledWith({
        spaceId: 'space-1',
        sessionId: globalSession.id,
        role: 'seed',
        isPrimary: true,
      })
    })
    expect(loadAttempts).toHaveBeenCalledWith('space-1')
  })
})
