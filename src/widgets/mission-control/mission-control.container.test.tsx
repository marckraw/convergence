import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import type {
  ProviderInfo,
  SessionStore,
  SessionSummary,
} from '@/entities/session'
import type { ComposerSessionContext } from '@/features/composer'
import { MissionControl } from './mission-control.container'

// The Hail must render the app's real composer, not a copy of it. The widget's
// job is aiming it at the right Session; what the composer then does is the
// composer's own business, and its own tests.
vi.mock('@/features/composer', () => ({
  ComposerContainer: ({ context }: { context: ComposerSessionContext }) => (
    <div data-testid="composer" data-context={JSON.stringify(context)} />
  ),
}))

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session-1',
    contextKind: 'project',
    projectId: 'project-1',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'claude-opus-5',
    effort: null,
    name: 'Wire the room',
    status: 'idle',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/repos/convergence',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-08-13T10:00:00.000Z',
    updatedAt: '2026-08-13T10:00:00.000Z',
    ...overrides,
  }
}

function makeProvider(
  id: string,
  midRunInput: Partial<ProviderInfo['midRunInput']>,
): ProviderInfo {
  return {
    id,
    name: id,
    vendorLabel: id === 'claude-code' ? 'Anthropic' : 'OpenAI',
    kind: 'conversation',
    supportsContinuation: true,
    defaultModelId: 'model-1',
    modelOptions: [],
    attachments: {
      supportsImage: false,
      supportsPdf: false,
      supportsText: false,
      maxImageBytes: 0,
      maxPdfBytes: 0,
      maxTextBytes: 0,
      maxTotalBytes: 0,
    },
    midRunInput: {
      supportsAnswer: false,
      supportsNativeFollowUp: false,
      supportsAppQueuedFollowUp: false,
      supportsSteer: false,
      supportsInterrupt: false,
      defaultRunningMode: null,
      ...midRunInput,
    },
  }
}

const CLAUDE_CODE = makeProvider('claude-code', {
  supportsAnswer: true,
  supportsAppQueuedFollowUp: true,
  defaultRunningMode: 'follow-up',
})

type SendMessage = SessionStore['sendMessageToSession']

let sendMessageToSession: ReturnType<typeof vi.fn<SendMessage>>
let getAllSummaries: ReturnType<typeof vi.fn>

function seed(sessions: SessionSummary[], providers: ProviderInfo[] = []) {
  useSessionStore.setState({
    globalSessions: sessions,
    globalChatSessions: [],
    sessions: [],
    providers,
    needsYouDismissals: {},
    error: null,
    loadProviders: vi.fn(async () => undefined),
    sendMessageToSession,
  })
  useProjectStore.setState({
    projects: [
      {
        id: 'project-1',
        name: 'Convergence',
        repositoryPath: '/repos/convergence',
        settings: useProjectStore.getState().projects[0]?.settings ?? undefined,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'project-2',
        name: 'Emergence',
        repositoryPath: '/repos/emergence',
        settings: useProjectStore.getState().projects[0]?.settings ?? undefined,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ] as never,
  })
}

describe('MissionControl', () => {
  beforeEach(() => {
    sendMessageToSession = vi.fn<SendMessage>(async () => undefined)
    getAllSummaries = vi.fn(async () => [])
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      session: { getAllSummaries },
    }
  })

  it('shows cards for sessions across more than one project', async () => {
    seed(
      [
        makeSession({ id: 'a', name: 'Wire the room', projectId: 'project-1' }),
        makeSession({
          id: 'b',
          name: 'Fix the tunnel',
          projectId: 'project-2',
        }),
      ],
      [CLAUDE_CODE],
    )

    render(<MissionControl />)

    expect(await screen.findByText('Wire the room')).toBeInTheDocument()
    expect(screen.getByText('Fix the tunnel')).toBeInTheDocument()
    expect(screen.getByText('Convergence')).toBeInTheDocument()
    expect(screen.getByText('Emergence')).toBeInTheDocument()
  })

  it('reads the summaries the app already holds instead of fetching again', async () => {
    seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

    render(<MissionControl />)
    await screen.findByText('Wire the room')

    expect(getAllSummaries).not.toHaveBeenCalled()
  })

  it('shows two agents in visibly different states at once', async () => {
    seed(
      [
        makeSession({
          id: 'a',
          name: 'Busy agent',
          status: 'running',
          activity: 'tool:Bash',
        }),
        makeSession({ id: 'b', name: 'Resting agent', status: 'idle' }),
      ],
      [CLAUDE_CODE],
    )

    render(<MissionControl />)

    expect(await screen.findByText('running tool: Bash')).toBeInTheDocument()
    expect(screen.getByText('idle')).toBeInTheDocument()
  })

  it('updates a card live when a summary update arrives for any session', async () => {
    const session = makeSession({ id: 'a', status: 'idle', activity: null })
    seed([session], [CLAUDE_CODE])

    render(<MissionControl />)
    expect(await screen.findByText('idle')).toBeInTheDocument()

    // Exactly what the session:summaryUpdated broadcast does in the app.
    act(() => {
      useSessionStore.getState().handleSessionSummaryUpdate({
        ...session,
        status: 'running',
        activity: 'tool:Grep',
        updatedAt: '2026-08-13T11:00:00.000Z',
      })
    })

    expect(await screen.findByText('running tool: Grep')).toBeInTheDocument()
    expect(screen.queryByText('idle')).not.toBeInTheDocument()
  })

  it('narrows cards as the search query is typed', async () => {
    seed(
      [
        makeSession({ id: 'a', name: 'Wire the room', projectId: 'project-1' }),
        makeSession({
          id: 'b',
          name: 'Fix the tunnel',
          projectId: 'project-2',
        }),
      ],
      [CLAUDE_CODE],
    )

    render(<MissionControl />)
    await screen.findByText('Wire the room')

    fireEvent.change(screen.getByLabelText('Search session cards'), {
      target: { value: 'tunnel' },
    })

    expect(screen.queryByText('Wire the room')).not.toBeInTheDocument()
    expect(screen.getByText('Fix the tunnel')).toBeInTheDocument()
  })

  it('tells the two empty states apart', async () => {
    seed([], [CLAUDE_CODE])
    const { unmount } = render(<MissionControl />)
    expect(await screen.findByText('No sessions yet')).toBeInTheDocument()
    unmount()

    seed([makeSession({ id: 'a' })], [CLAUDE_CODE])
    render(<MissionControl />)
    await screen.findByText('Wire the room')
    fireEvent.change(screen.getByLabelText('Search session cards'), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText(/No cards match/)).toBeInTheDocument()
  })

  it('opens the session when a card is clicked', async () => {
    const onOpenSession = vi.fn()
    seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

    render(<MissionControl onOpenSession={onOpenSession} />)
    fireEvent.click(await screen.findByLabelText('Open Wire the room'))

    expect(onOpenSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
    )
  })

  it('opens the real composer, aimed at the hailed session', async () => {
    seed([makeSession({ id: 'a', projectId: 'project-1' })], [CLAUDE_CODE])

    render(<MissionControl />)
    expect(screen.queryByTestId('composer')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByLabelText('Hail Wire the room'))

    const composer = await screen.findByTestId('composer')
    expect(JSON.parse(composer.dataset.context ?? '{}')).toEqual({
      kind: 'project',
      projectId: 'project-1',
      workspaceId: null,
      activeSessionId: 'a',
    })
  })

  it('hails a chat session through the global composer context', async () => {
    seed(
      [
        makeSession({
          id: 'chat',
          contextKind: 'global',
          projectId: null,
          name: 'Ask about the room',
        }),
      ],
      [CLAUDE_CODE],
    )

    render(<MissionControl />)
    fireEvent.click(await screen.findByLabelText('Hail Ask about the room'))

    const composer = await screen.findByTestId('composer')
    expect(JSON.parse(composer.dataset.context ?? '{}')).toEqual({
      kind: 'global',
      activeSessionId: 'chat',
    })
  })

  it('names the session and its live state above the composer', async () => {
    const session = makeSession({ id: 'a', status: 'idle' })
    seed([session], [CLAUDE_CODE])

    render(<MissionControl />)
    fireEvent.click(await screen.findByLabelText('Hail Wire the room'))

    expect(await screen.findByText('Hail Wire the room')).toBeInTheDocument()
    expect(screen.getByText(/Convergence · Anthropic/)).toHaveTextContent(
      'idle',
    )

    act(() => {
      useSessionStore.getState().handleSessionSummaryUpdate({
        ...session,
        status: 'running',
        activity: 'streaming',
        updatedAt: '2026-08-13T11:00:00.000Z',
      })
    })

    // The Hail reads the live card, so the state it shows keeps up.
    await waitFor(() => {
      expect(screen.getByText(/Convergence · Anthropic/)).toHaveTextContent(
        'writing response…',
      )
    })
  })

  it('closes the hail without navigating to the session', async () => {
    const onOpenSession = vi.fn()
    seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

    render(<MissionControl onOpenSession={onOpenSession} />)
    fireEvent.click(await screen.findByLabelText('Hail Wire the room'))
    expect(await screen.findByTestId('composer')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() =>
      expect(screen.queryByTestId('composer')).not.toBeInTheDocument(),
    )
    expect(onOpenSession).not.toHaveBeenCalled()
  })
})
