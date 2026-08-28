import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/entities/project'
import { useSessionCrewStore } from '@/entities/session-crew'
import { useSessionRelayStore } from '@/entities/session-relay'
import type { SessionRelay } from '@/entities/session-relay'
import type {
  CreateSessionCrewInput,
  SessionCrew,
} from '@/entities/session-crew'
import { localProviderCatalogs, useSessionStore } from '@/entities/session'
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
let listCrews: ReturnType<typeof vi.fn<() => Promise<SessionCrew[]>>>
let listHops: ReturnType<typeof vi.fn>
let listRelays: ReturnType<typeof vi.fn>
let createCrew: ReturnType<
  typeof vi.fn<(input: CreateSessionCrewInput) => Promise<SessionCrew>>
>

function makeCrew(
  overrides: Partial<SessionCrew> & { id: string },
): SessionCrew {
  return {
    name: overrides.id,
    emoji: null,
    accentColor: null,
    position: 0,
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    sessionIds: [],
    ...overrides,
  }
}

function seed(sessions: SessionSummary[], providers: ProviderInfo[] = []) {
  useSessionStore.setState({
    globalSessions: sessions,
    globalChatSessions: [],
    sessions: [],
    providerCatalogs: localProviderCatalogs(providers),
    needsYouDismissals: {},
    error: null,
    loadProviders: vi.fn(async () => undefined),
    loadProviderCatalog: vi.fn(async () => undefined),
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

function seedCrews(crews: SessionCrew[]) {
  listCrews.mockResolvedValue(crews)
}

function makeRelay(
  overrides: Partial<SessionRelay> & { id: string },
): SessionRelay {
  return {
    crewId: 'crew-1',
    sourceSessionId: 'a',
    trigger: 'settled',
    action: 'hail',
    targetSessionId: null,
    spawnSpec: null,
    instruction: null,
    opener: null,
    armed: true,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  }
}

function seedRelays(relays: SessionRelay[]) {
  listRelays.mockResolvedValue(relays)
}

describe('MissionControl', () => {
  beforeEach(() => {
    localStorage.clear()
    sendMessageToSession = vi.fn<SendMessage>(async () => undefined)
    getAllSummaries = vi.fn(async () => [])
    listCrews = vi.fn(async () => [])
    listHops = vi.fn(async () => [])
    listRelays = vi.fn(async () => [])
    createCrew = vi.fn(async (input) =>
      makeCrew({
        id: 'created-crew',
        name: input.name.trim(),
        emoji: input.emoji ?? null,
        accentColor: input.accentColor ?? null,
        sessionIds: [...(input.sessionIds ?? [])],
      }),
    )
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      session: { getAllSummaries },
      crew: {
        list: listCrews,
        create: createCrew,
        addMember: vi.fn(),
        removeMember: vi.fn(),
        onUpdated: vi.fn(() => () => undefined),
      },
      relay: {
        list: listRelays,
        listHops,
        onUpdated: vi.fn(() => () => undefined),
        onHopAppended: vi.fn(() => () => undefined),
        onHopsCleared: vi.fn(() => () => undefined),
      },
      providerAccounts: { list: vi.fn(async () => []) },
    }
    useSessionRelayStore.getState().unsubscribeBroadcast?.()
    useSessionRelayStore.getState().unsubscribeHops?.()
    useSessionRelayStore.setState({
      relays: [],
      hopsByCrewId: {},
      isLoaded: false,
      error: null,
      unsubscribeBroadcast: null,
      unsubscribeHops: null,
      unsubscribeHopsCleared: null,
    })
    useSessionCrewStore.getState().unsubscribeBroadcast?.()
    useSessionCrewStore.setState({
      crews: [],
      isLoaded: false,
      error: null,
      unsubscribeBroadcast: null,
    })
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

  it('toggles the hail off when the same card is hailed again', async () => {
    seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

    render(<MissionControl />)
    const hail = await screen.findByLabelText('Hail Wire the room')

    fireEvent.click(hail)
    expect(await screen.findByTestId('composer')).toBeInTheDocument()

    fireEvent.click(hail)
    await waitFor(() =>
      expect(screen.queryByTestId('composer')).not.toBeInTheDocument(),
    )
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

    fireEvent.click(screen.getByLabelText('Close hail'))

    await waitFor(() =>
      expect(screen.queryByTestId('composer')).not.toBeInTheDocument(),
    )
    expect(onOpenSession).not.toHaveBeenCalled()
  })

  describe('the crew filter dimension', () => {
    it('narrows the flat room to a crew and back', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Night shift', sessionIds: ['a'] }),
      ])
      seed(
        [
          makeSession({ id: 'a', name: 'Owl agent' }),
          makeSession({ id: 'b', name: 'Lark agent' }),
        ],
        [CLAUDE_CODE],
      )

      render(<MissionControl />)

      const chip = await screen.findByRole('button', { name: /Night shift/ })
      fireEvent.click(chip)

      await waitFor(() =>
        expect(screen.queryByText('Lark agent')).not.toBeInTheDocument(),
      )
      expect(screen.getByText('Owl agent')).toBeInTheDocument()

      fireEvent.click(chip)
      expect(await screen.findByText('Lark agent')).toBeInTheDocument()
    })

    it('counts what turning a chip on would show, not what is already shown', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Night shift', sessionIds: ['a'] }),
        makeCrew({
          id: 'crew-2',
          name: 'Day shift',
          position: 1,
          sessionIds: ['b'],
        }),
      ])
      seed([makeSession({ id: 'a' }), makeSession({ id: 'b' })], [CLAUDE_CODE])

      render(<MissionControl />)
      fireEvent.click(
        await screen.findByRole('button', { name: /Night shift/ }),
      )

      // Day shift still says 1: its count answers "what if I pick this too".
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /Day shift/ }),
        ).toHaveTextContent('1'),
      )
    })

    it('remembers the picked crew across a remount', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Night shift', sessionIds: ['a'] }),
      ])
      seed(
        [
          makeSession({ id: 'a', name: 'Owl agent' }),
          makeSession({ id: 'b', name: 'Lark agent' }),
        ],
        [CLAUDE_CODE],
      )

      const first = render(<MissionControl />)
      fireEvent.click(
        await screen.findByRole('button', { name: /Night shift/ }),
      )
      await waitFor(() =>
        expect(screen.queryByText('Lark agent')).not.toBeInTheDocument(),
      )
      first.unmount()

      render(<MissionControl />)
      expect(await screen.findByText('Owl agent')).toBeInTheDocument()
      expect(screen.queryByText('Lark agent')).not.toBeInTheDocument()
    })

    it('badges a card with every crew holding it', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Masterminds', sessionIds: ['a'] }),
        makeCrew({
          id: 'crew-2',
          name: 'Workers',
          position: 1,
          sessionIds: ['a'],
        }),
      ])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)

      expect(
        await screen.findByTitle('In crew Masterminds'),
      ).toBeInTheDocument()
      expect(screen.getByTitle('In crew Workers')).toBeInTheDocument()
    })

    it('shows no chips at all before any crew exists', async () => {
      seedCrews([])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await screen.findByText('Wire the room')

      expect(screen.queryByTitle(/^In crew/)).not.toBeInTheDocument()
    })
  })

  describe('crews view', () => {
    async function switchToCrews() {
      fireEvent.click(await screen.findByRole('button', { name: 'Crews' }))
    }

    it('starts flat and switches to bordered crew containers', async () => {
      seedCrews([makeCrew({ id: 'crew-1', name: 'Night shift' })])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await screen.findByText('Wire the room')
      expect(document.querySelectorAll('[data-crew-container]')).toHaveLength(0)

      await switchToCrews()

      expect(
        await screen.findByRole('heading', { name: 'Night shift' }),
      ).toBeInTheDocument()
      expect(
        document.querySelectorAll('[data-crew-container]').length,
      ).toBeGreaterThan(0)
    })

    it('keeps uncrewed sessions visible in a No crew section', async () => {
      seedCrews([makeCrew({ id: 'crew-1', name: 'Night shift' })])
      seed([makeSession({ id: 'a', name: 'Loose agent' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCrews()

      expect(await screen.findByText('No crew')).toBeInTheDocument()
      expect(screen.getByText('Loose agent')).toBeInTheDocument()
    })

    it('renders a session held by two crews inside both containers', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Masterminds', sessionIds: ['a'] }),
        makeCrew({
          id: 'crew-2',
          name: 'Workers',
          position: 1,
          sessionIds: ['a'],
        }),
      ])
      seed([makeSession({ id: 'a', name: 'Double agent' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCrews()

      expect(
        await screen.findByRole('heading', { name: 'Masterminds' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Workers' }),
      ).toBeInTheDocument()
      expect(screen.getAllByText('Double agent')).toHaveLength(2)
      // Nothing is loose, so the catch-all section stays away.
      expect(screen.queryByText('No crew')).not.toBeInTheDocument()
    })

    it('shows an empty crew rather than hiding it', async () => {
      seedCrews([makeCrew({ id: 'crew-1', name: 'Nobody yet' })])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCrews()

      expect(
        await screen.findByRole('heading', { name: 'Nobody yet' }),
      ).toBeInTheDocument()
      expect(screen.getByText('0 sessions')).toBeInTheDocument()
      expect(
        screen.getByText('No sessions in this crew yet.'),
      ).toBeInTheDocument()
    })

    it('outlines a crew in red when one of its wires errored', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a', 'b'] }),
      ])
      seed([makeSession({ id: 'a' }), makeSession({ id: 'b' })], [CLAUDE_CODE])
      listHops.mockResolvedValue([
        {
          id: 'h1',
          relayId: 'r1',
          crewId: 'crew-1',
          flowRunId: 'run-1',
          firedAt: '2026-08-15T10:00:00.000Z',
          sourceSessionId: 'a',
          targetSessionId: 'b',
          spawnedSessionId: null,
          triggerStatus: 'completed',
          payloadPreview: null,
          outcome: 'error',
          error: 'The target session no longer exists.',
        },
      ])

      render(<MissionControl />)
      await switchToCrews()

      await waitFor(() => {
        expect(
          document.querySelector('[data-crew-alarm="true"]'),
        ).toBeInTheDocument()
      })
      expect(
        screen.getByText('1 relay hop needs your eyes'),
      ).toBeInTheDocument()
    })

    it('leaves a crew whose wires all behaved unmarked', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a', 'b'] }),
      ])
      seed([makeSession({ id: 'a' }), makeSession({ id: 'b' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCrews()

      await screen.findByRole('heading', { name: 'Review loop' })
      expect(
        document.querySelector('[data-crew-alarm="true"]'),
      ).not.toBeInTheDocument()
    })

    it('remembers the layout choice for the next visit', async () => {
      seedCrews([makeCrew({ id: 'crew-1', name: 'Night shift' })])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      const first = render(<MissionControl />)
      await switchToCrews()
      await screen.findByRole('heading', { name: 'Night shift' })
      first.unmount()

      render(<MissionControl />)
      expect(
        await screen.findByRole('heading', { name: 'Night shift' }),
      ).toBeInTheDocument()
    })

    it('creates a crew from a card and shows it as a container', async () => {
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)

      // Every gesture here is a click: no console, no seeding.
      fireEvent.click(
        await screen.findByLabelText('Add Wire the room to a crew', {
          selector: 'button',
        }),
      )
      fireEvent.click(await screen.findByText('New crew'))
      fireEvent.change(screen.getByLabelText('New crew name'), {
        target: { value: 'Night shift' },
      })
      fireEvent.click(screen.getByLabelText('Emoji 🌙'))
      fireEvent.click(screen.getByLabelText('Violet'))
      fireEvent.click(screen.getByText('Create & add this session'))

      await waitFor(() =>
        expect(createCrew).toHaveBeenCalledWith({
          name: 'Night shift',
          emoji: '🌙',
          accentColor: '#7c3aed',
          sessionIds: ['a'],
        }),
      )

      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: 'Escape',
      })
      await switchToCrews()

      expect(
        await screen.findByRole('heading', { name: 'Night shift' }),
      ).toBeInTheDocument()
      expect(screen.getByText('1 session')).toBeInTheDocument()
      // The card sits inside its new crew rather than the catch-all.
      expect(screen.queryByText('No crew')).not.toBeInTheDocument()
    })

    it('offers rename, decoration and delete from the crew header', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Night shift', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCrews()

      fireEvent.click(await screen.findByLabelText('Edit crew Night shift'))

      expect(await screen.findByLabelText('Crew name')).toHaveValue(
        'Night shift',
      )
      expect(screen.getByLabelText('Emoji 🐎')).toBeInTheDocument()
      expect(screen.getByLabelText('Violet')).toBeInTheDocument()
      expect(screen.getByText('Delete crew')).toBeInTheDocument()
    })

    it('gives the No crew section no menu — it is not a crew', async () => {
      seedCrews([])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCrews()

      await screen.findByText('No crew')
      expect(
        screen.queryByLabelText('Edit crew No crew'),
      ).not.toBeInTheDocument()
    })

    it('hails a card from inside its crew container', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Night shift', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCrews()

      fireEvent.click(await screen.findByLabelText('Hail Wire the room'))

      expect(await screen.findByTestId('composer')).toBeInTheDocument()
    })
  })

  describe('canvas view', () => {
    async function switchToCanvas() {
      fireEvent.click(await screen.findByRole('button', { name: 'Canvas' }))
    }

    it('draws crewed sessions as nodes inside their crew', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Night shift', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await screen.findByText('Wire the room')
      expect(
        document.querySelectorAll('[data-canvas-session-node]'),
      ).toHaveLength(0)

      await switchToCanvas()

      await waitFor(() => {
        expect(
          document.querySelector('[data-canvas-session-node="a"]'),
        ).toBeInTheDocument()
      })
      expect(
        document.querySelector('[data-canvas-crew="crew-1"]'),
      ).toBeInTheDocument()
    })

    /** The canvas is about flows, so a session in no crew has nothing to draw. */
    it('leaves uncrewed sessions off the canvas', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Night shift', sessionIds: ['a'] }),
      ])
      seed(
        [
          makeSession({ id: 'a' }),
          makeSession({ id: 'b', name: 'Loose agent' }),
        ],
        [CLAUDE_CODE],
      )

      render(<MissionControl />)
      await switchToCanvas()

      await waitFor(() => {
        expect(
          document.querySelector('[data-canvas-session-node="a"]'),
        ).toBeInTheDocument()
      })
      expect(
        document.querySelector('[data-canvas-session-node="b"]'),
      ).not.toBeInTheDocument()
    })

    it('explains itself when there is nothing wired to draw', async () => {
      seedCrews([])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCanvas()

      expect(
        await screen.findByText('Nothing wired to draw yet'),
      ).toBeInTheDocument()
    })

    it('opens a session from its node, like the card body does', async () => {
      const onOpenSession = vi.fn()
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Night shift', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl onOpenSession={onOpenSession} />)
      await switchToCanvas()

      fireEvent.click(await screen.findByLabelText('Open Wire the room'))

      expect(onOpenSession).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a' }),
      )
    })

    /**
     * Both wired sessions have to be on the canvas for a wire to have ends.
     * The wire's own geometry is React Flow's, computed from measured handle
     * positions that jsdom does not have -- what it looks like is judged by
     * eye, and what colour it asks for is pinned in canvas-graph.pure.test.
     */
    it('draws both ends of a wire as nodes in one crew', async () => {
      seedCrews([
        makeCrew({
          id: 'crew-1',
          name: 'Review loop',
          sessionIds: ['a', 'b'],
        }),
      ])
      seedRelays([
        makeRelay({ id: 'r1', sourceSessionId: 'a', targetSessionId: 'b' }),
      ])
      seed(
        [
          makeSession({ id: 'a', name: 'Mastermind' }),
          makeSession({ id: 'b', name: 'Executor' }),
        ],
        [CLAUDE_CODE],
      )

      render(<MissionControl />)
      await switchToCanvas()

      await waitFor(() => {
        expect(
          document.querySelector('[data-canvas-session-node="a"]'),
        ).toBeInTheDocument()
      })
      expect(
        document.querySelector('[data-canvas-session-node="b"]'),
      ).toBeInTheDocument()
      expect(screen.getByText('Mastermind')).toBeInTheDocument()
      expect(screen.getByText('Executor')).toBeInTheDocument()
    })

    it('draws the session a spawn wire promises, before it exists', async () => {
      seedCrews([makeCrew({ id: 'crew-1', sessionIds: ['a'] })])
      seedRelays([
        makeRelay({
          id: 'r-spawn',
          sourceSessionId: 'a',
          action: 'spawn',
          spawnSpec: {
            projectId: 'project-1',
            providerId: 'codex',
            model: 'gpt-5.6',
            effort: null,
            name: 'Reviewer',
            providerAccountId: null,
          },
        }),
      ])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCanvas()

      await waitFor(() => {
        expect(
          document.querySelector('[data-canvas-spawn-node="r-spawn"]'),
        ).toBeInTheDocument()
      })
      expect(screen.getByText('Reviewer')).toBeInTheDocument()
      expect(
        screen.getByText('starts a new session · codex · gpt-5.6'),
      ).toBeInTheDocument()
    })

    it('dims the chip of a spawn wire that is switched off', async () => {
      seedCrews([makeCrew({ id: 'crew-1', sessionIds: ['a'] })])
      seedRelays([
        makeRelay({
          id: 'r-spawn',
          sourceSessionId: 'a',
          action: 'spawn',
          armed: false,
          spawnSpec: {
            projectId: 'project-1',
            providerId: 'codex',
            model: null,
            effort: null,
            name: 'Reviewer',
            providerAccountId: null,
          },
        }),
      ])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCanvas()

      await waitFor(() => {
        expect(
          document.querySelector('[data-canvas-spawn-node="r-spawn"]'),
        ).toBeInTheDocument()
      })
      expect(
        document.querySelector('[data-canvas-spawn-node="r-spawn"]')?.className,
      ).toContain('opacity-70')
    })

    /**
     * The store keeps live hops only for crews whose trail is already loaded,
     * and the crew containers that normally ask are not mounted in this view.
     * Without this the wires would never light, and nothing else would fail.
     */
    it('loads the hop trail for every crew it draws, so wires can light', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', sessionIds: ['a'] }),
        makeCrew({ id: 'crew-2', sessionIds: ['b'] }),
      ])
      seed(
        [makeSession({ id: 'a' }), makeSession({ id: 'b', name: 'Second' })],
        [CLAUDE_CODE],
      )

      render(<MissionControl />)
      await switchToCanvas()

      await waitFor(() => {
        expect(listHops).toHaveBeenCalledWith('crew-1', 51, null)
      })
      expect(listHops).toHaveBeenCalledWith('crew-2', 51, null)
    })

    it('does not ask for a trail for a crew it is not drawing', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', sessionIds: ['a'] }),
        // Empty crews are not drawn, so they have no wires to light.
        makeCrew({ id: 'crew-empty', sessionIds: [] }),
      ])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCanvas()

      await waitFor(() => {
        expect(listHops).toHaveBeenCalledWith('crew-1', 51, null)
      })
      expect(listHops).not.toHaveBeenCalledWith('crew-empty', 51, null)
    })

    it('wears the room’s theme rather than the library’s default', async () => {
      document.documentElement.classList.add('dark')
      seedCrews([makeCrew({ id: 'crew-1', sessionIds: ['a'] })])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCanvas()

      // React Flow applies its own class through a state update inside an
      // effect, so it lands a render behind the prop it was given. Both are
      // asserted inside one waitFor rather than across the gap between them.
      await waitFor(() => {
        expect(document.querySelector('[data-session-canvas]')).toHaveAttribute(
          'data-canvas-color-mode',
          'dark',
        )
        expect(document.querySelector('.react-flow.dark')).toBeInTheDocument()
      })

      document.documentElement.classList.remove('dark')

      await waitFor(() => {
        expect(document.querySelector('[data-session-canvas]')).toHaveAttribute(
          'data-canvas-color-mode',
          'light',
        )
        expect(
          document.querySelector('.react-flow.dark'),
        ).not.toBeInTheDocument()
      })
    })

    it('remembers the canvas the way it remembers the other two views', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Night shift', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCanvas()

      await waitFor(() => {
        expect(
          JSON.parse(
            localStorage.getItem('convergence-mission-control-view') ?? '{}',
          ).mode,
        ).toBe('canvas')
      })
    })
  })
})
