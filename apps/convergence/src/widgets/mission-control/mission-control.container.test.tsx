import { useCrewHailStore } from '@/entities/crew-hail'
import type { RelayHop } from '@/entities/session-relay'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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

import type { ReactFlowProps, ReactFlowInstance } from '@xyflow/react'
const flow = vi.hoisted(() => ({ props: null as ReactFlowProps | null }))
vi.mock('@xyflow/react', async (original) => {
  const actual = await original<typeof import('@xyflow/react')>()
  return {
    ...actual,
    ReactFlow: (props: ReactFlowProps) => {
      flow.props = props
      return <actual.ReactFlow {...props} />
    },
  }
})

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
    supportsConversationReset: false,
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
let createRelay: ReturnType<typeof vi.fn>
let updateRelay: ReturnType<typeof vi.fn>
let setMemberPosition: ReturnType<typeof vi.fn>
let acknowledgeHail: ReturnType<typeof vi.fn>
let listRuns: ReturnType<typeof vi.fn>
let createCrew: ReturnType<
  typeof vi.fn<(input: CreateSessionCrewInput) => Promise<SessionCrew>>
>

/** One empty run, which is all the paging test needs to tell pages apart. */
function makeRun(flowRunId: string, startedAt: string) {
  return {
    flowRunId,
    crewId: 'crew-1',
    startedAt,
    endedAt: startedAt,
    lastActivityAt: startedAt,
    owedBy: null,
    handedBackAt: null,
    laps: [],
    hails: [],
    status: { word: 'finished-quiet' as const, reason: null },
    counts: { deliveries: 0, failures: 0, laps: 0, events: 0 },
  }
}

function makeCrew(
  overrides: Partial<SessionCrew> & { id: string },
): SessionCrew {
  return {
    name: overrides.id,
    emoji: null,
    accentColor: null,
    position: 0,
    roundCap: null,
    stallMinutes: null,
    members: [],
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
    conditionToken: null,
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
    createRelay = vi.fn(async () => {
      throw new Error('no test may store a wire by accident')
    })
    updateRelay = vi.fn(async () => {
      throw new Error('no test may store a wire by accident')
    })
    setMemberPosition = vi.fn(async () => makeCrew({ id: 'crew-1' }))
    acknowledgeHail = vi.fn(async () => undefined)
    listRuns = vi.fn(async () => ({
      runs: [],
      unattributedHails: [],
      outcomes: {},
      hasMore: false,
    }))
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
        setMemberBatonName: vi.fn(),
        setMemberPosition,
        update: vi.fn(),
        onUpdated: vi.fn(() => () => undefined),
      },
      relay: {
        list: listRelays,
        listHops,
        listRuns,
        // Watched, never stubbed away: the point of the drawing canaries is
        // that no gesture on the canvas reaches these.
        create: createRelay,
        update: updateRelay,
        delete: vi.fn(),
        onUpdated: vi.fn(() => () => undefined),
        onHopAppended: vi.fn(() => () => undefined),
        onHopsCleared: vi.fn(() => () => undefined),
      },
      providerAccounts: { list: vi.fn(async () => []) },
      crewHail: {
        listOpen: vi.fn(async () => []),
        // Watched: Mark seen must reach THIS and nothing else.
        acknowledge: acknowledgeHail,
        acknowledgeCrew: vi.fn(),
        onUpdated: vi.fn(() => () => undefined),
      },
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

  // The Crews view retired with R13 (RUN45): every capability it had —
  // membership, wire authoring, baton names, limits, and the calls waiting
  // for a human — now has a home on the Canvas, and its suite moved with it.
  // What survives here is the mode list, which must no longer offer it.
  it('offers two layouts, because Crews retired into the Canvas', async () => {
    seedCrews([makeCrew({ id: 'crew-1', name: 'Night shift' })])
    seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

    render(<MissionControl />)
    await screen.findByText('Wire the room')

    expect(
      await screen.findByRole('button', { name: 'Flat' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Canvas' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Crews' }),
    ).not.toBeInTheDocument()
  })

  describe('canvas view', () => {
    async function switchToCanvas() {
      fireEvent.click(await screen.findByRole('button', { name: 'Canvas' }))
    }
    it.each(['keyboard', 'remove change'] as const)(
      'G1 disables %s deletion (mutation: restore the corresponding deletion path)',
      async (proof) => {
        seedCrews([makeCrew({ id: 'crew-1', sessionIds: ['a'] })])
        seed([makeSession({ id: 'a' })], [CLAUDE_CODE])
        render(<MissionControl />)
        await switchToCanvas()
        await screen.findByText('Wire the room')
        if (proof === 'keyboard') expect(flow.props?.deleteKeyCode).toBeNull()
        else {
          act(() => flow.props?.onNodesChange?.([{ id: 'a', type: 'remove' }]))
          expect(
            document.querySelector('.react-flow__node[data-id="a"]'),
          ).not.toBeNull()
        }
      },
    )

    it.each(['dragging', 'awaiting save'] as const)(
      'G3 preserves local coordinates while %s through a metadata rebuild (mutation: adopt graph identity changes)',
      async (phase) => {
        seedCrews([makeCrew({ id: 'crew-1', sessionIds: ['a'] })])
        seed([makeSession({ id: 'a', name: 'Moving card' })], [CLAUDE_CODE])
        setMemberPosition.mockImplementation(() => new Promise(() => {}))
        render(<MissionControl />)
        await switchToCanvas()
        await screen.findByText('Moving card')
        act(() =>
          flow.props?.onNodesChange?.([
            {
              id: 'a',
              type: 'position',
              position: { x: 300, y: 400 },
              dragging: phase === 'dragging',
            },
          ]),
        )
        act(() =>
          useSessionStore.setState({
            globalSessions: [makeSession({ id: 'a', name: 'Updated card' })],
          }),
        )
        const node = flow.props!.nodes!.find((entry) => entry.id === 'a')!
        expect.soft(node.position).toEqual({ x: 300, y: 400 })
        act(() =>
          flow.props?.onNodeDragStop?.(new MouseEvent('mouseup'), node, [node]),
        )
        await waitFor(() =>
          expect(setMemberPosition).toHaveBeenCalledWith('crew-1', 'a', {
            x: 300,
            y: 400,
          }),
        )
      },
    )

    it.each(['dragging', 'confirmed'] as const)(
      'G3 handles changed store coordinates while %s (mutations: adopt during dragging; preserve every local coordinate)',
      async (phase) => {
        const crew = makeCrew({ id: 'crew-1', sessionIds: ['a'] })
        seedCrews([crew])
        seed([makeSession({ id: 'a' })], [CLAUDE_CODE])
        render(<MissionControl />)
        await switchToCanvas()
        await screen.findByText('Wire the room')
        act(() =>
          flow.props?.onNodesChange?.([
            {
              id: 'a',
              type: 'position',
              position: { x: 300, y: 400 },
              dragging: true,
            },
          ]),
        )
        act(() =>
          useSessionCrewStore.setState({
            crews: [
              {
                ...crew,
                members: [
                  {
                    sessionId: 'a',
                    batonName: null,
                    canvasX: 600,
                    canvasY: 320,
                  },
                ],
              },
            ],
          }),
        )
        if (phase === 'confirmed') {
          act(() =>
            flow.props?.onNodesChange?.([
              { id: 'a', type: 'position', dragging: false },
            ]),
          )
          act(() =>
            useSessionCrewStore.setState({
              crews: [
                {
                  ...crew,
                  members: [
                    {
                      sessionId: 'a',
                      batonName: null,
                      canvasX: 600,
                      canvasY: 420,
                    },
                  ],
                },
              ],
            }),
          )
        }
        expect(
          flow.props!.nodes!.find((entry) => entry.id === 'a')!.position,
        ).toEqual(
          phase === 'dragging' ? { x: 300, y: 400 } : { x: 600, y: 420 },
        )
      },
    )

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

    /**
     * Frame 08. A room with no crews has nothing to author, and the Canvas
     * says what to do next rather than reading as a view that failed to load.
     * It also says the thing people fear most about crews out loud: nothing
     * disappears from Flat by not being in one.
     */
    it('explains itself when there is no crew to draw', async () => {
      seedCrews([])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCanvas()

      expect(
        await screen.findByText('Start with a conversation'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          'Conversations outside crews remain available in Flat.',
        ),
      ).toBeInTheDocument()
    })

    /**
     * THE drawing canary. Connect mode picks two cards and opens the panel as
     * a DRAFT — no row, no message. A drawn connection that saved itself would
     * make a slipped pick a stored, armed wire, and an armed wire is one
     * settle away from spending provider quota.
     *
     * Mutation that reds it: have `openDraft` call `createRelay` — the
     * refusing mock throws and the assertion below fails.
     */
    it('draws by clicking two cards, and stores nothing', async () => {
      seedCrews([
        makeCrew({
          id: 'crew-1',
          name: 'Review loop',
          sessionIds: ['a', 'b'],
        }),
      ])
      seed(
        [
          makeSession({ id: 'a', name: 'Fable' }),
          makeSession({ id: 'b', name: 'Opus' }),
        ],
        [CLAUDE_CODE],
      )

      render(<MissionControl />)
      await switchToCanvas()
      await waitFor(() => {
        expect(
          document.querySelector('[data-canvas-session-node="b"]'),
        ).toBeInTheDocument()
      })

      fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))
      expect(
        await screen.findByText(/Choose the conversation that finishes/),
      ).toBeInTheDocument()

      fireEvent.click(await screen.findByLabelText('Connect to Fable'))
      expect(await screen.findByText(/Fable selected/)).toBeInTheDocument()

      fireEvent.click(await screen.findByLabelText('Connect to Opus'))

      // The panel opened on an unsaved draft…
      expect(await screen.findByText('New connection')).toBeInTheDocument()
      expect(screen.getByText('Not saved yet')).toBeInTheDocument()
      // …and nothing was written or sent.
      expect(createRelay).not.toHaveBeenCalled()
      expect(updateRelay).not.toHaveBeenCalled()
    })

    /**
     * The keyboard route is the SAME route, not a second one: both call the
     * one connect-mode machine, so they cannot drift apart.
     *
     * Mutation that reds it: give the card's `onKeyDown` its own branch that
     * calls `onOpen` while Connect is armed.
     */
    it('draws the same connection from the keyboard', async () => {
      const onOpenSession = vi.fn()
      seedCrews([
        makeCrew({
          id: 'crew-1',
          name: 'Review loop',
          sessionIds: ['a', 'b'],
        }),
      ])
      seed(
        [
          makeSession({ id: 'a', name: 'Fable' }),
          makeSession({ id: 'b', name: 'Opus' }),
        ],
        [CLAUDE_CODE],
      )

      render(<MissionControl onOpenSession={onOpenSession} />)
      await switchToCanvas()
      await waitFor(() => {
        expect(
          document.querySelector('[data-canvas-session-node="b"]'),
        ).toBeInTheDocument()
      })

      fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))
      fireEvent.keyDown(await screen.findByLabelText('Connect to Fable'), {
        key: 'Enter',
      })
      fireEvent.keyDown(await screen.findByLabelText('Connect to Opus'), {
        key: 'Enter',
      })

      expect(await screen.findByText('New connection')).toBeInTheDocument()
      // Enter PICKED rather than navigated: the mode decides, not the device.
      expect(onOpenSession).not.toHaveBeenCalled()
      expect(createRelay).not.toHaveBeenCalled()
    })

    /**
     * M3. The discard guard was on the toolbar and Cancel only, so the three
     * gestures that also replace or orphan a draft threw it away without
     * asking: drawing a second pair, picking a run, and opening a recorded
     * event (which is how *View current connection* is reached at all -- it
     * lives on the event inspector, and reaching it used to leave the draft
     * stranded in state for the next connection to overwrite).
     *
     * The fix is one door rather than three patches: every panel change and
     * every draft replacement goes through `leaveDraft`.
     *
     * Mutation that reds it: bypass the guard on any ONE of the three -- call
     * `setPanelState` directly from `onSelectRun`, or drop the guard from
     * `openDraft`, or from `onSelectEvent`.
     */
    it('asks before losing an unsaved draft, whichever way you leave', async () => {
      seedCrews([
        makeCrew({
          id: 'crew-1',
          name: 'Review loop',
          sessionIds: ['a', 'b', 'c'],
        }),
      ])
      seed(
        [
          makeSession({ id: 'a', name: 'Fable' }),
          makeSession({ id: 'b', name: 'Opus' }),
          makeSession({ id: 'c', name: 'Sol' }),
        ],
        [CLAUDE_CODE],
      )
      listRuns.mockResolvedValue({
        runs: [
          {
            flowRunId: 'run-1',
            crewId: 'crew-1',
            startedAt: '2026-09-06T12:00:00.000Z',
            endedAt: '2026-09-06T12:05:00.000Z',
            laps: [
              {
                lap: 1,
                hops: [
                  {
                    id: 'h1',
                    relayId: 'w1',
                    crewId: 'crew-1',
                    flowRunId: 'run-1',
                    firedAt: '2026-09-06T12:00:00.000Z',
                    sourceSessionId: 'a',
                    targetSessionId: 'b',
                    spawnedSessionId: null,
                    triggerStatus: 'completed',
                    payloadPreview: null,
                    baton: null,
                    roundNumber: 1,
                    lapNumber: 1,
                    settledAt: '2026-09-06T12:01:00.000Z',
                    dispatchId: 'receipt-1',
                    outcome: 'delivered',
                    error: null,
                  },
                ],
              },
            ],
            hails: [],
            status: { word: 'finished-quiet', reason: null },
            counts: { deliveries: 1, failures: 0, laps: 1, events: 1 },
          },
        ],
        unattributedHails: [],
        outcomes: { h1: 'delivered' },
        hasMore: false,
      })

      render(<MissionControl />)
      await switchToCanvas()
      await waitFor(() => {
        expect(
          document.querySelector('[data-canvas-session-node="c"]'),
        ).toBeInTheDocument()
      })

      /** Draws Fable → Opus and leaves it unsaved. */
      async function drawDraft() {
        fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))
        fireEvent.click(await screen.findByLabelText('Connect to Fable'))
        fireEvent.click(await screen.findByLabelText('Connect to Opus'))
        expect(await screen.findByText('New connection')).toBeInTheDocument()
      }

      /** Answers the alert with *Keep editing* and proves the draft survived. */
      async function keepEditing() {
        fireEvent.click(
          await screen.findByRole('button', { name: 'Keep editing' }),
        )
        expect(screen.getByText('New connection')).toBeInTheDocument()
        expect(screen.getByText('Not saved yet')).toBeInTheDocument()
      }

      // 1. Drawing a second pair.
      await drawDraft()
      fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))
      fireEvent.click(await screen.findByLabelText('Connect to Fable'))
      fireEvent.click(await screen.findByLabelText('Connect to Sol'))
      expect(
        await screen.findByRole('alertdialog', { name: 'Discard this draft?' }),
      ).toBeInTheDocument()
      await keepEditing()

      // 2. Picking a run in history.
      fireEvent.click(await screen.findByRole('button', { name: /History/ }))
      fireEvent.click(await screen.findByText('1 delivery'))
      expect(
        await screen.findByRole('alertdialog', { name: 'Discard this draft?' }),
      ).toBeInTheDocument()
      await keepEditing()

      // 3. Opening a recorded event — the only door to *View current
      //    connection*, and the one that used to strand the draft silently.
      fireEvent.click(await screen.findByText('Fable → Opus'))
      expect(
        await screen.findByRole('alertdialog', { name: 'Discard this draft?' }),
      ).toBeInTheDocument()
      await keepEditing()

      expect(createRelay).not.toHaveBeenCalled()
      expect(updateRelay).not.toHaveBeenCalled()
    })

    it('keeps the pending pair when retaining a draft (mutation: commit connect mode before guard)', async () => {
      seedCrews([
        makeCrew({
          id: 'crew-1',
          name: 'Review loop',
          sessionIds: ['a', 'b', 'c'],
        }),
      ])
      seed(
        [
          makeSession({ id: 'a', name: 'Fable' }),
          makeSession({ id: 'b', name: 'Opus' }),
          makeSession({ id: 'c', name: 'Sol' }),
        ],
        [CLAUDE_CODE],
      )
      render(<MissionControl />)
      await switchToCanvas()
      fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))
      fireEvent.click(await screen.findByLabelText('Connect to Fable'))
      fireEvent.click(await screen.findByLabelText('Connect to Opus'))
      fireEvent.change(await screen.findByLabelText('Standing instructions'), {
        target: { value: 'Original draft' },
      })
      fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))
      fireEvent.click(await screen.findByLabelText('Connect to Fable'))
      fireEvent.click(await screen.findByLabelText('Connect to Sol'))
      fireEvent.click(
        await screen.findByRole('button', { name: 'Keep editing' }),
      )
      expect({
        connecting: screen
          .getByRole('button', { name: 'Connect' })
          .getAttribute('aria-pressed'),
        source: screen.queryByText(/Fable selected/) !== null,
        draft: (
          screen.getByLabelText('Standing instructions') as HTMLTextAreaElement
        ).value,
      }).toEqual({ connecting: 'true', source: true, draft: 'Original draft' })
    })

    it.each(['Keep editing', 'Discard draft'])(
      'guards a crew switch: %s (mutations: bypass crew leaveDraft / delete stopPropagation)',
      async (answer) => {
        const onOpenSession = vi.fn()
        seedCrews([
          makeCrew({ id: 'crew-1', name: 'Crew A', sessionIds: ['a', 'b'] }),
          makeCrew({ id: 'crew-2', name: 'Crew B', sessionIds: ['c'] }),
        ])
        seed(
          [
            makeSession({ id: 'a', name: 'Fable' }),
            makeSession({ id: 'b', name: 'Opus' }),
            makeSession({ id: 'c', name: 'Sol' }),
          ],
          [CLAUDE_CODE],
        )
        render(<MissionControl onOpenSession={onOpenSession} />)
        await switchToCanvas()
        fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))
        fireEvent.click(await screen.findByLabelText('Connect to Fable'))
        fireEvent.click(await screen.findByLabelText('Connect to Opus'))
        fireEvent.change(
          await screen.findByLabelText('Standing instructions'),
          { target: { value: 'Keep this draft' } },
        )
        fireEvent.click(await screen.findByLabelText('Open Sol'))
        const dialog = screen.queryByRole('alertdialog', {
          name: 'Discard this draft?',
        })
        if (dialog)
          fireEvent.click(screen.getByRole('button', { name: answer }))
        expect({
          asked: dialog !== null,
          selected: document.querySelector('[data-canvas-toolbar] h2')
            ?.textContent,
          draft: screen.queryByRole('region', { name: 'Connection' }) !== null,
          text:
            (
              screen.queryByLabelText(
                'Standing instructions',
              ) as HTMLTextAreaElement | null
            )?.value ?? null,
        }).toEqual({
          asked: true,
          selected: answer === 'Keep editing' ? 'Crew A' : 'Crew B',
          draft: answer === 'Keep editing',
          text: answer === 'Keep editing' ? 'Keep this draft' : null,
        })
        // Neither answer replays the card click held by the discard guard.
        expect(onOpenSession).not.toHaveBeenCalled()
      },
    )

    it('leaves Enter meaning "open" when Connect is not armed', async () => {
      const onOpenSession = vi.fn()
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a', name: 'Fable' })], [CLAUDE_CODE])

      render(<MissionControl onOpenSession={onOpenSession} />)
      await switchToCanvas()

      fireEvent.keyDown(await screen.findByLabelText('Open Fable'), {
        key: 'Enter',
      })

      expect(onOpenSession).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a' }),
      )
    })

    it('offers the crew’s own settings and its conversations from the toolbar', async () => {
      seedCrews([
        makeCrew({
          id: 'crew-1',
          name: 'Review loop',
          sessionIds: ['a'],
          members: [
            {
              sessionId: 'a',
              batonName: 'fable',
              canvasX: null,
              canvasY: null,
            },
          ],
        }),
      ])
      seed([makeSession({ id: 'a', name: 'Fable' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCanvas()
      await waitFor(() => {
        expect(
          document.querySelector('[data-canvas-session-node="a"]'),
        ).toBeInTheDocument()
      })

      // R13: every capability the retired Crews view had has a Canvas home.
      fireEvent.click(
        await screen.findByRole('button', { name: /Crew settings/ }),
      )
      expect(
        await screen.findByRole('region', { name: 'Crew settings' }),
      ).toBeInTheDocument()
      expect(screen.getByDisplayValue('fable')).toBeInTheDocument()
      expect(
        screen.getByLabelText('Delivery limit per run for this crew'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('A run can contain several laps'),
      ).toBeInTheDocument()

      // From the settings panel's own button, not the toolbar's: both lead
      // to the same panel, and the settings one is the reachable path for
      // somebody already looking at the roster.
      fireEvent.click(
        screen.getByRole('button', { name: '+ Add conversation' }),
      )
      expect(
        await screen.findByRole('region', { name: 'Add conversations' }),
      ).toBeInTheDocument()
    })

    /**
     * Frame 09, at the layer that can actually break it. The panel renders a
     * kept draft — its own test proves that — but only the container decides
     * whether there IS still a draft after a refusal, and throwing the form
     * away is the defect this state exists to prevent: the typed work is the
     * expensive part, not the row.
     *
     * Mutation that reds it: `setDraft(null)` in `save`'s failure branch.
     */
    it('keeps a failed save’s draft, and leaves the stored wire alone', async () => {
      createRelay.mockRejectedValueOnce(new Error('The database is locked.'))
      seedCrews([
        makeCrew({
          id: 'crew-1',
          name: 'Review loop',
          sessionIds: ['a', 'b'],
        }),
      ])
      seed(
        [
          makeSession({ id: 'a', name: 'Fable' }),
          makeSession({ id: 'b', name: 'Opus' }),
        ],
        [CLAUDE_CODE],
      )

      render(<MissionControl />)
      await switchToCanvas()
      await waitFor(() => {
        expect(
          document.querySelector('[data-canvas-session-node="b"]'),
        ).toBeInTheDocument()
      })

      fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))
      fireEvent.click(await screen.findByLabelText('Connect to Fable'))
      fireEvent.click(await screen.findByLabelText('Connect to Opus'))

      const instructions = await screen.findByLabelText(
        /Standing instructions/i,
      )
      fireEvent.change(instructions, {
        target: { value: 'Implement the brief.' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(
        await screen.findByText('Couldn’t save the connection'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          'Your draft is kept here. The saved connection has not changed.',
        ),
      ).toBeInTheDocument()
      // The typed work survived the refusal.
      expect(
        screen.getByDisplayValue('Implement the brief.'),
      ).toBeInTheDocument()
      // And trying again is about settings, never about resending.
      expect(
        screen.getByText(
          'Trying again saves settings. It does not resend a message.',
        ),
      ).toBeInTheDocument()
    })

    /**
     * R11's clipping half. jsdom does no layout, so "nothing renders outside
     * the viewport" cannot be measured here — what CAN be pinned is the
     * mechanism, and its absence is exactly how a route ends up painted
     * across the panel beside the canvas and the chrome above it.
     *
     * Mutation that reds it: drop `overflow-hidden` from the canvas frame.
     * How it actually looks at the edges is on Marcin's QA list.
     */
    it('keeps the diagram inside its own frame', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a', name: 'Fable' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCanvas()

      await waitFor(() => {
        expect(document.querySelector('[data-session-canvas]')).toHaveClass(
          'overflow-hidden',
        )
      })
    })

    /**
     * THE acknowledgement canary (promise 5). **Mark seen acknowledges and
     * nothing else** — the whole point of the sentence beside it is that it
     * does not reply, does not restart, and does not approve. So the test
     * watches the one call that should happen and the two that must not.
     *
     * Mutation that reds it: have `onMarkSeen` also create or update a relay.
     */
    it('marks a call seen without sending or storing anything', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a', name: 'Fable' })], [CLAUDE_CODE])
      listRuns.mockResolvedValue({
        runs: [
          {
            flowRunId: 'run-1',
            crewId: 'crew-1',
            startedAt: '2026-09-06T12:00:00.000Z',
            endedAt: '2026-09-06T12:39:00.000Z',
            laps: [],
            hails: [
              {
                id: 'call-1',
                crewId: 'crew-1',
                flowRunId: 'run-1',
                reason: 'terminal',
                sessionId: 'a',
                baton: 'marcin',
                message: 'Two decisions need your eyes.',
                detail: 'This station handed the work to you.',
                raisedAt: '2026-09-06T12:39:00.000Z',
                acknowledgedAt: null,
              },
            ],
            status: { word: 'handed-back', reason: null },
            counts: { deliveries: 0, failures: 0, laps: 0, events: 1 },
          },
        ],
        unattributedHails: [],
        outcomes: { 'call-1': 'handed-back' },
        hasMore: false,
      })

      render(<MissionControl />)
      await switchToCanvas()
      await waitFor(() => {
        expect(
          document.querySelector('[data-canvas-session-node="a"]'),
        ).toBeInTheDocument()
      })

      fireEvent.click(await screen.findByRole('button', { name: /History/ }))
      fireEvent.click(await screen.findByText(/handed the run back to you/))

      const markSeen = await screen.findByRole('button', { name: 'Mark seen' })
      expect(
        screen.getByText(
          'Mark seen acknowledges this call. It does not send a reply or restart the run.',
        ),
      ).toBeInTheDocument()

      fireEvent.click(markSeen)

      await waitFor(() => {
        expect(acknowledgeHail).toHaveBeenCalledWith('call-1')
      })
      // Nothing was stored and nothing was sent.
      expect(createRelay).not.toHaveBeenCalled()
      expect(updateRelay).not.toHaveBeenCalled()
    })

    /**
     * Promise 6, the half about names: an event names the conversations it
     * actually involved, resolved from the WHOLE room rather than from who
     * happens to be in the crew today. A conversation removed from a crew is
     * still a conversation, and its recorded events must stay readable.
     *
     * Mutation that reds it: resolve names from `crew.sessionIds` instead of
     * the session list — the row falls back to "a conversation that is gone"
     * for somebody who is merely no longer a member.
     */
    it('still names a conversation that has left the crew', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a'] }),
      ])
      seed(
        [
          makeSession({ id: 'a', name: 'Fable' }),
          // In the room, NOT in the crew any more.
          makeSession({ id: 'b', name: 'Opus' }),
        ],
        [CLAUDE_CODE],
      )
      listRuns.mockResolvedValue({
        runs: [
          {
            flowRunId: 'run-1',
            crewId: 'crew-1',
            startedAt: '2026-09-06T12:00:00.000Z',
            endedAt: '2026-09-06T12:05:00.000Z',
            laps: [
              {
                lap: 1,
                hops: [
                  {
                    id: 'h1',
                    relayId: 'w1',
                    crewId: 'crew-1',
                    flowRunId: 'run-1',
                    firedAt: '2026-09-06T12:00:00.000Z',
                    sourceSessionId: 'a',
                    targetSessionId: 'b',
                    spawnedSessionId: null,
                    triggerStatus: 'completed',
                    payloadPreview: null,
                    baton: null,
                    roundNumber: 1,
                    lapNumber: 1,
                    settledAt: null,
                    outcome: 'delivered',
                    error: null,
                  },
                ],
              },
            ],
            hails: [],
            status: { word: 'finished-quiet', reason: null },
            counts: { deliveries: 1, failures: 0, laps: 1, events: 1 },
          },
        ],
        unattributedHails: [],
        outcomes: { h1: 'delivered' },
        hasMore: false,
      })

      render(<MissionControl />)
      await switchToCanvas()
      fireEvent.click(await screen.findByRole('button', { name: /History/ }))

      expect(await screen.findByText('Fable → Opus')).toBeInTheDocument()
    })

    /**
     * L2. `hasMore` is the page's own observation that another run exists
     * below it, and it was being read by nobody: the panel asked for one page
     * and stopped, so a crew with more than twenty runs simply lost the rest.
     *
     * Mutation that reds it: drop the `hasMore` row, or call `listRuns`
     * without the `before` cursor.
     */
    it.each(['hop', 'hail'] as const)(
      'RUN66 R5 refreshes on %s only for the open crew — mutation drop subscription or reset selection turns red',
      async (source) => {
        seedCrews([
          makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a'] }),
        ])
        seed(
          [makeSession({ id: 'a', name: 'Fable', status: 'running' })],
          [CLAUDE_CODE],
        )
        const listeners = new Set<(hop: RelayHop) => void>()
        vi.mocked(window.electronAPI.relay.onHopAppended).mockImplementation(
          (listener) => {
            listeners.add(listener)
            return () => {
              listeners.delete(listener)
            }
          },
        )
        const cursor = {
          asOf: '2026-09-10T10:55:00.000Z',
          live: 0 as const,
          lastActivityAt: '2026-09-10T10:02:00',
          flowRunId: 'r2',
        }
        const first = {
          runs: [
            {
              ...makeRun('r1', '2026-09-10T10:03:00'),
              status: { word: 'running' as const, reason: null },
              owedBy: {
                hopId: 'owed',
                targetSessionId: 'a',
                firedAt: '2026-09-10T10:03:00',
              },
            },
            makeRun('r2', '2026-09-10T10:02:00'),
          ],
          unattributedHails: [],
          outcomes: {},
          hasMore: true,
          nextCursor: cursor,
        }
        listRuns
          .mockResolvedValueOnce(first)
          .mockResolvedValueOnce({
            ...first,
            runs: [makeRun('r3', '2026-09-10T10:01:00')],
            hasMore: false,
            nextCursor: null,
          })
          .mockResolvedValue({
            ...first,
            nextCursor: { ...cursor, asOf: '2026-09-10T10:56:00.000Z' },
          })
        const { unmount } = render(<MissionControl />)
        await switchToCanvas()
        fireEvent.click(await screen.findByRole('button', { name: /History/ }))
        await waitFor(() => expect(listRuns).toHaveBeenCalledTimes(1))
        fireEvent.click(
          await screen.findByRole('button', { name: 'Load older runs' }),
        )
        await waitFor(() =>
          expect(
            document.querySelectorAll('ul > li > button[aria-pressed]'),
          ).toHaveLength(3),
        )
        const selected = document.querySelectorAll<HTMLButtonElement>(
          'ul > li > button[aria-pressed]',
        )[2]
        fireEvent.click(selected)
        const scroll = selected.closest('ul')!
        scroll.scrollTop = 72
        listRuns.mockClear()
        const broadcast = (crewId: string) => {
          if (source === 'hop')
            for (const listener of listeners)
              listener({ id: 'hop', crewId } as RelayHop)
          else
            useCrewHailStore.setState({
              hails: [
                {
                  id: 'hail',
                  crewId,
                  flowRunId: 'r1',
                  sessionId: 'a',
                  reason: 'terminal',
                  baton: 'marcin',
                  message: null,
                  detail: 'Returned',
                  raisedAt: new Date().toISOString(),
                  acknowledgedAt: null,
                },
              ],
            })
        }
        vi.useFakeTimers()
        try {
          act(() => broadcast('other-crew'))
          await act(async () => vi.advanceTimersByTimeAsync(600))
          const unrelated = listRuns.mock.calls.length
          act(() => {
            broadcast('crew-1')
            broadcast('crew-1')
            broadcast('crew-1')
          })
          await act(async () => vi.advanceTimersByTimeAsync(499))
          const before = listRuns.mock.calls.length
          await act(async () => vi.advanceTimersByTimeAsync(1))
          const after = listRuns.mock.calls.slice()
          const debtShown = Boolean(
            screen.queryByText(/Waiting · Fable · since .*10:03 · running/),
          )
          fireEvent.click(
            screen.getByRole('button', { name: 'Load older runs' }),
          )
          await act(async () => {})
          const freshCursor = listRuns.mock.calls.at(-1)?.[1]
          const preserved = {
            pressed: selected.getAttribute('aria-pressed'),
            connected: selected.isConnected,
            scroll: scroll.scrollTop,
            rows: document.querySelectorAll('ul > li > button[aria-pressed]')
              .length,
          }
          fireEvent.click(screen.getByRole('button', { name: 'Close history' }))
          act(() => broadcast('crew-1'))
          await act(async () => vi.advanceTimersByTimeAsync(600))
          expect({
            unrelated,
            before,
            after,
            debtShown,
            freshCursor,
            preserved,
            closed: listRuns.mock.calls.length,
          }).toEqual({
            unrelated: 0,
            before: 0,
            after: [['crew-1', undefined]],
            debtShown: true,
            freshCursor: {
              before: { ...cursor, asOf: '2026-09-10T10:56:00.000Z' },
            },
            preserved: {
              pressed: 'true',
              connected: true,
              scroll: 72,
              rows: 3,
            },
            closed: 2,
          })
        } finally {
          unmount()
          vi.useRealTimers()
        }
      },
    )

    it.each(['older-result', 'older-error', 'refresh-result', 'refresh-error'])(
      'RUN66 R5 ignores obsolete %s — mutation remove history epoch guard turns red',
      async (mode) => {
        seedCrews([makeCrew({ id: 'crew-1', sessionIds: ['a'] })])
        seed([makeSession({ id: 'a', name: 'Fable' })], [CLAUDE_CODE])
        const listeners = new Set<(hop: RelayHop) => void>()
        vi.mocked(window.electronAPI.relay.onHopAppended).mockImplementation(
          (listener) => {
            listeners.add(listener)
            return () => {
              listeners.delete(listener)
            }
          },
        )
        const page = (id: string) => ({
          runs: [makeRun(id, '2026-09-10T10:03:00')],
          unattributedHails: [],
          outcomes: {},
          hasMore: true,
          nextCursor: {
            asOf: '2026-09-10T10:55:00Z',
            live: 0,
            lastActivityAt: '2026-09-10T10:03:00',
            flowRunId: id,
          },
        })
        let resolve!: (value: ReturnType<typeof page>) => void
        let reject!: (reason: Error) => void
        const pending = new Promise<ReturnType<typeof page>>((yes, no) => {
          resolve = yes
          reject = no
        })
        listRuns
          .mockResolvedValueOnce(page('first'))
          .mockReturnValueOnce(pending)
          .mockResolvedValueOnce(page('fresh'))
        const { unmount } = render(<MissionControl />)
        await switchToCanvas()
        fireEvent.click(await screen.findByRole('button', { name: /History/ }))
        await waitFor(() => expect(listRuns).toHaveBeenCalledTimes(1))
        const broadcast = () => {
          for (const listener of listeners)
            listener({ id: 'hop', crewId: 'crew-1' } as RelayHop)
        }
        vi.useFakeTimers()
        try {
          if (mode.startsWith('older'))
            fireEvent.click(
              screen.getByRole('button', { name: 'Load older runs' }),
            )
          else {
            act(broadcast)
            await act(async () => vi.advanceTimersByTimeAsync(500))
          }
          act(broadcast)
          await act(async () => vi.advanceTimersByTimeAsync(500))
          await act(async () => {
            if (mode.endsWith('error')) reject(new Error('obsolete failure'))
            else resolve(page('obsolete'))
          })
          expect({
            calls: listRuns.mock.calls.length,
            rows: document.querySelectorAll('ul > li > button[aria-pressed]')
              .length,
            error: screen.queryByText('obsolete failure')?.textContent ?? null,
            older:
              screen.queryByRole('button', { name: 'Load older runs' })
                ?.textContent ?? null,
          }).toEqual({
            calls: 3,
            rows: 2,
            error: null,
            older: 'Load older runs',
          })
        } finally {
          unmount()
          vi.useRealTimers()
        }
      },
    )

    it('keeps every loaded run on an older-page failure and retries that page (mutation: historyError)', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a', name: 'Fable' })], [CLAUDE_CODE])
      const page = (ids: string[], hasMore = true) => ({
        runs: ids.map((id) => makeRun(id, '2026-09-06T12:00:00.000Z')),
        unattributedHails: [],
        outcomes: {},
        hasMore,
        nextCursor: hasMore
          ? {
              asOf: '2026-09-10T12:00:00.000Z',
              live: 0,
              lastActivityAt: '2026-09-06T12:00:00.000Z',
              flowRunId: ids.at(-1)!,
            }
          : null,
      })
      listRuns
        .mockResolvedValueOnce(page(['run-1', 'run-2']))
        .mockResolvedValueOnce(page(['run-3']))
        .mockRejectedValueOnce(new Error('Older records unavailable'))
        .mockResolvedValueOnce(page(['run-4'], false))
      render(<MissionControl />)
      await switchToCanvas()
      fireEvent.click(await screen.findByRole('button', { name: /History/ }))
      fireEvent.click(
        await screen.findByRole('button', { name: 'Load older runs' }),
      )
      await waitFor(() => {
        if (
          screen.queryAllByRole('button', { name: /0 deliveries/ }).length !== 3
        )
          throw new Error('waiting for appended page')
      })
      fireEvent.click(
        await screen.findByRole('button', { name: 'Load older runs' }),
      )
      await screen.findByText('Older records unavailable')
      expect({
        runs: screen.queryAllByRole('button', { name: /0 deliveries/ }).length,
        inline: screen.queryByRole('alert')?.textContent,
        fullError: screen.queryByText('Couldn’t load history'),
      }).toEqual({
        runs: 3,
        inline: 'Older records unavailable',
        fullError: null,
      })
      fireEvent.click(
        await screen.findByRole('button', { name: 'Retry older runs' }),
      )
      await waitFor(() => {
        expect({
          runs: screen.queryAllByRole('button', { name: /0 deliveries/ })
            .length,
          lastRead: listRuns.mock.calls.at(-1),
          error: screen.queryByText('Older records unavailable'),
        }).toEqual({
          runs: 4,
          lastRead: ['crew-1', { before: page(['run-3']).nextCursor }],
          error: null,
        })
      })
    })

    it('loads older runs when the page says there are more', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a', name: 'Fable' })], [CLAUDE_CODE])
      listRuns.mockImplementation(
        async (_crewId: string, options?: unknown) => {
          const before = (
            options as { before?: { flowRunId: string } } | undefined
          )?.before?.flowRunId
          return before === 'run-2'
            ? {
                runs: [makeRun('run-3', '2026-09-04T12:00:00.000Z')],
                unattributedHails: [],
                outcomes: {},
                hasMore: false,
              }
            : {
                runs: [
                  makeRun('run-1', '2026-09-06T12:00:00.000Z'),
                  makeRun('run-2', '2026-09-05T12:00:00.000Z'),
                ],
                unattributedHails: [],
                outcomes: {},
                hasMore: true,
                nextCursor: {
                  asOf: '2026-09-10T12:00:00.000Z',
                  live: 0,
                  lastActivityAt: '2026-09-05T12:00:00.000Z',
                  flowRunId: 'run-2',
                },
              }
        },
      )

      render(<MissionControl />)
      await switchToCanvas()
      fireEvent.click(await screen.findByRole('button', { name: /History/ }))

      const older = await screen.findByRole('button', {
        name: 'Load older runs',
      })
      fireEvent.click(older)

      await waitFor(() => {
        expect(listRuns).toHaveBeenCalledWith('crew-1', {
          before: {
            asOf: '2026-09-10T12:00:00.000Z',
            live: 0,
            lastActivityAt: '2026-09-05T12:00:00.000Z',
            flowRunId: 'run-2',
          },
        })
      })
      // The older page is appended, not swapped in: the run already on screen
      // stays, and the row that offered more is gone.
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: 'Load older runs' }),
        ).not.toBeInTheDocument()
      })
      expect(
        document.querySelectorAll('[aria-pressed]').length,
      ).toBeGreaterThan(0)
    })

    /**
     * L3. "Earlier calls" means the calls OTHER than the one you are looking
     * at. Subtracting one unconditionally made a hop event -- which is not a
     * call at all -- undercount every call in the page by exactly one.
     *
     * Mutation that reds it: subtract one whatever the opened event is.
     */
    it('counts the other calls, not always one less than all of them', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a'] }),
      ])
      seed(
        [
          makeSession({ id: 'a', name: 'Fable' }),
          makeSession({ id: 'b', name: 'Opus' }),
        ],
        [CLAUDE_CODE],
      )
      listRuns.mockResolvedValue({
        runs: [
          {
            flowRunId: 'run-1',
            crewId: 'crew-1',
            startedAt: '2026-09-06T12:00:00.000Z',
            endedAt: '2026-09-06T12:05:00.000Z',
            laps: [
              {
                lap: 1,
                hops: [
                  {
                    id: 'h1',
                    relayId: 'w1',
                    crewId: 'crew-1',
                    flowRunId: 'run-1',
                    firedAt: '2026-09-06T12:00:00.000Z',
                    sourceSessionId: 'a',
                    targetSessionId: 'b',
                    spawnedSessionId: null,
                    triggerStatus: 'completed',
                    payloadPreview: null,
                    baton: null,
                    roundNumber: 1,
                    lapNumber: 1,
                    settledAt: '2026-09-06T12:01:00.000Z',
                    dispatchId: 'receipt-1',
                    outcome: 'delivered',
                    error: null,
                  },
                ],
              },
            ],
            hails: [
              {
                id: 'call-1',
                crewId: 'crew-1',
                flowRunId: 'run-1',
                reason: 'terminal',
                sessionId: 'a',
                baton: 'marcin',
                message: null,
                detail: 'Handed to you.',
                raisedAt: '2026-09-06T12:04:00.000Z',
                acknowledgedAt: null,
              },
              {
                id: 'call-2',
                crewId: 'crew-1',
                flowRunId: 'run-1',
                reason: 'stall',
                sessionId: 'b',
                baton: null,
                message: null,
                detail: 'Quiet for 30 minutes.',
                raisedAt: '2026-09-06T12:05:00.000Z',
                acknowledgedAt: null,
              },
            ],
            status: { word: 'needs-you', reason: 'stalled' },
            counts: { deliveries: 1, failures: 0, laps: 1, events: 3 },
          },
        ],
        unattributedHails: [],
        outcomes: {
          h1: 'delivered',
          'call-1': 'handed-back',
          'call-2': 'reply-overdue',
        },
        hasMore: false,
      })

      render(<MissionControl />)
      await switchToCanvas()
      fireEvent.click(await screen.findByRole('button', { name: /History/ }))

      // A HOP is not a call, so both calls are "other".
      fireEvent.click(await screen.findByText('Fable → Opus'))
      expect(await screen.findByText(/Earlier calls · 2/)).toBeInTheDocument()

      // A CALL is one of them, so the other one is what is left.
      fireEvent.click(await screen.findByText(/handed the run back to you/))
      expect(await screen.findByText(/Earlier calls · 1/)).toBeInTheDocument()
    })

    /**
     * Promise 6: the graph is labelled the CURRENT layout, because that is
     * what it is — today's wires wearing yesterday's outcomes, never a
     * reconstruction of the topology the run actually had.
     *
     * Mutation that reds it: drop the banner, or word it as though the
     * diagram were a snapshot.
     */
    it('labels a replayed run as shown on the current layout', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a', name: 'Fable' })], [CLAUDE_CODE])
      listRuns.mockResolvedValue({
        runs: [
          {
            flowRunId: 'run-1',
            crewId: 'crew-1',
            startedAt: '2026-09-06T12:00:00.000Z',
            endedAt: '2026-09-06T12:39:00.000Z',
            laps: [],
            hails: [],
            status: { word: 'finished-quiet', reason: null },
            counts: { deliveries: 0, failures: 0, laps: 0, events: 0 },
          },
        ],
        unattributedHails: [],
        outcomes: {},
        hasMore: false,
      })

      render(<MissionControl />)
      await switchToCanvas()
      fireEvent.click(await screen.findByRole('button', { name: /History/ }))

      expect(
        await screen.findByText(/shown on current crew layout/i),
      ).toBeInTheDocument()
    })

    it('says a crew with no records has none, and does not claim it never ran', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'Review loop', sessionIds: ['a'] }),
      ])
      seed([makeSession({ id: 'a', name: 'Fable' })], [CLAUDE_CODE])

      render(<MissionControl />)
      await switchToCanvas()
      fireEvent.click(await screen.findByRole('button', { name: /History/ }))

      expect(
        await screen.findByText('No history available yet'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('No records does not imply this crew has never run.'),
      ).toBeInTheDocument()
    })

    /**
     * Selecting a stored connection by clicking its wire has NO test here on
     * purpose, and this comment is the disclosure rather than a gap left
     * quiet: React Flow renders no edge DOM under jsdom — edge geometry comes
     * from measured handle positions the environment does not have — so there
     * is nothing to click. What that path does once it fires IS pinned: the
     * stored wire becomes a draft in `connection-draft.pure.test.ts`, and the
     * draft reaches the screen in `connection-inspector.render.test.tsx`. The
     * click itself is on Marcin's QA list.
     */

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

  describe('round 5 live-review canaries', () => {
    async function switchToCanvas() {
      fireEvent.click(await screen.findByRole('button', { name: 'Canvas' }))
    }
    it('L-x nudges a card dropped onto the chair (mutation: restrict obstacles to sessions)', async () => {
      seedCrews([makeCrew({ id: 'crew-1', sessionIds: ['a'] })])
      seed([makeSession({ id: 'a', name: 'Moving card' })], [CLAUDE_CODE])
      seedRelays([
        makeRelay({
          id: 'baton',
          sourceSessionId: 'a',
          conditionToken: 'BATON: a',
        }),
      ])
      render(<MissionControl />)
      await switchToCanvas()
      await screen.findByText('Marcin')
      const chair = flow.props!.nodes!.find((entry) => entry.type === 'chair')!
      const node = {
        ...flow.props!.nodes!.find((entry) => entry.id === 'a')!,
        position: { ...chair.position },
      }
      await act(async () =>
        flow.props?.onNodeDragStop?.(new MouseEvent('mouseup'), node, [node]),
      )
      expect(setMemberPosition).toHaveBeenCalledWith('crew-1', 'a', {
        x: chair.position.x,
        y: chair.position.y + 140,
      })
    })

    it.each([
      ['persisted', 'restore upward nudging'],
      ['shown', 'restore upward nudging'],
      ['other card', 'restore upward nudging'],
      ['above title', 'omit title floor'],
    ] as const)(
      'H-R15 keeps the nudged drop %s after save resolves (mutation: %s)',
      async (proof, _mutation) => {
        const crew = makeCrew({ id: 'crew-1', sessionIds: ['a', 'b'] })
        seedCrews([crew])
        seed(
          [
            makeSession({ id: 'a', name: 'First card' }),
            makeSession({ id: 'b', name: 'Dragged card' }),
          ],
          [CLAUDE_CODE],
        )
        setMemberPosition.mockImplementation(
          async (_crewId, sessionId, position) => {
            const saved = {
              ...crew,
              members: [
                {
                  sessionId,
                  batonName: null,
                  canvasX: position.x,
                  canvasY: position.y,
                },
              ],
            }
            listCrews.mockResolvedValue([saved])
            return saved
          },
        )
        render(<MissionControl />)
        await switchToCanvas()
        await screen.findByText('Dragged card')
        const other = flow.props!.nodes!.find((entry) => entry.id === 'a')!
        const beforeTransform = (
          document.querySelector(
            '.react-flow__node[data-id="a"]',
          ) as HTMLElement
        ).style.transform
        const node = {
          ...flow.props!.nodes!.find((entry) => entry.id === 'b')!,
          position:
            proof === 'above title' ? { x: 400, y: 0 } : { ...other.position },
        }
        act(() =>
          flow.props?.onNodesChange?.([
            {
              id: 'b',
              type: 'position',
              position: node.position,
              dragging: true,
            },
          ]),
        )
        await act(async () =>
          flow.props?.onNodeDragStop?.(new MouseEvent('mouseup'), node, [node]),
        )
        if (proof === 'persisted') {
          await waitFor(() =>
            expect(setMemberPosition).toHaveBeenCalledWith('crew-1', 'b', {
              x: 20,
              y: 224,
            }),
          )
        } else if (proof === 'shown') {
          expect(
            document.querySelector('.react-flow__node[data-id="b"]'),
          ).toHaveStyle({ transform: 'translate(20px,224px)' })
        } else {
          expect(
            (
              document.querySelector(
                '.react-flow__node[data-id="a"]',
              ) as HTMLElement
            ).style.transform,
          ).toBe(beforeTransform)
        }
      },
    )

    it.each(['transform', 'persisted position'] as const)(
      'F2 moves the %s (mutation: omit onNodesChange)',
      async (proof) => {
        seedCrews([
          makeCrew({ id: 'crew-1', name: 'Moving crew', sessionIds: ['a'] }),
        ])
        seed([makeSession({ id: 'a', name: 'Moving card' })], [CLAUDE_CODE])
        render(<MissionControl />)
        await switchToCanvas()
        await screen.findByText('Moving card')
        act(() =>
          flow.props?.onNodesChange?.([
            {
              id: 'a',
              type: 'position',
              position: { x: 300, y: 400 },
              dragging: true,
            },
          ]),
        )
        if (proof === 'transform') {
          expect(
            document.querySelector('.react-flow__node[data-id="a"]'),
          ).toHaveStyle({ transform: 'translate(300px,400px)' })
        } else {
          const node = flow.props!.nodes!.find((entry) => entry.id === 'a')!
          act(() =>
            flow.props?.onNodeDragStop?.(new MouseEvent('mouseup'), node, [
              node,
            ]),
          )
          await waitFor(() =>
            expect(setMemberPosition).toHaveBeenCalledWith('crew-1', 'a', {
              x: 300,
              y: 400,
            }),
          )
        }
      },
    )

    it.each(['toolbar', 'add target'] as const)(
      'F3 follows the visible crew in the %s (mutation: fall back to crewGroups[0])',
      async (proof) => {
        seedCrews([
          makeCrew({ id: 'crew-1', name: 'First crew', sessionIds: ['a'] }),
          makeCrew({ id: 'crew-2', name: 'Visible crew', sessionIds: ['b'] }),
        ])
        seed(
          [
            makeSession({ id: 'a', name: 'First card' }),
            makeSession({ id: 'b', name: 'Visible card' }),
          ],
          [CLAUDE_CODE],
        )
        render(<MissionControl />)
        fireEvent.click(
          await screen.findByRole('button', { name: /Visible crew/ }),
        )
        await switchToCanvas()
        await screen.findByText('Visible card')
        if (proof === 'toolbar') {
          expect(
            within(
              document.querySelector('[data-canvas-toolbar]') as HTMLElement,
            ).getByRole('heading'),
          ).toHaveTextContent('Visible crew')
        } else {
          fireEvent.click(
            screen.getByRole('button', { name: /Add conversation/ }),
          )
          expect(
            await screen.findByText(
              'Bring existing conversations into Visible crew.',
            ),
          ).toBeInTheDocument()
        }
      },
    )

    // jsdom ignores pointer-events: this proves handler wiring only. Marcin's
    // real pointer click is the other half of the frame-heading proof.
    it('F3 selects the clicked frame heading (mutation: omit cluster crew id)', async () => {
      seedCrews([
        makeCrew({ id: 'crew-1', name: 'First crew', sessionIds: ['a'] }),
        makeCrew({ id: 'crew-2', name: 'Second crew', sessionIds: ['b'] }),
      ])
      seed([makeSession({ id: 'a' }), makeSession({ id: 'b' })], [CLAUDE_CODE])
      render(<MissionControl />)
      await switchToCanvas()
      fireEvent.click(
        await screen.findByRole('heading', { name: 'Second crew' }),
      )
      expect(
        within(
          document.querySelector('[data-canvas-toolbar]') as HTMLElement,
        ).getByRole('heading'),
      ).toHaveTextContent('Second crew')
    })

    it('F4 puts history beside the graph in the left column (mutation: move history below the row)', async () => {
      seedCrews([makeCrew({ id: 'crew-1', sessionIds: ['a'] })])
      seed([makeSession({ id: 'a' })], [CLAUDE_CODE])
      render(<MissionControl />)
      await switchToCanvas()
      fireEvent.click(await screen.findByRole('button', { name: /History/ }))
      const history = await screen.findByRole('region', { name: 'History' })
      expect(
        history.parentElement?.querySelector(':scope > [data-canvas-graph]'),
      ).not.toBeNull()
    })

    it('L-vii refits height only (mutations: omit resize fitView; refit on width)', async () => {
      let observed: {
        callback: ResizeObserverCallback
        observer: ResizeObserver
        target: Element
      } | null = null
      class Observer implements ResizeObserver {
        constructor(private callback: ResizeObserverCallback) {}
        observe(target: Element) {
          if (target.hasAttribute('data-session-canvas'))
            observed = { callback: this.callback, observer: this, target }
        }
        unobserve() {}
        disconnect() {}
      }
      vi.stubGlobal('ResizeObserver', Observer)
      try {
        seedCrews([makeCrew({ id: 'crew-1', sessionIds: ['a'] })])
        seed([makeSession({ id: 'a' })], [CLAUDE_CODE])
        render(<MissionControl />)
        await switchToCanvas()
        await screen.findByText('Wire the room')
        const fitView = vi.fn(async () => true)
        act(() => {
          flow.props?.onInit?.({ fitView } as unknown as ReactFlowInstance)
          const entry = observed as {
            callback: ResizeObserverCallback
            observer: ResizeObserver
            target: Element
          } | null
          entry?.callback(
            [
              {
                target: entry.target,
                contentRect: { width: 640, height: 220 },
              } as ResizeObserverEntry,
            ],
            entry.observer,
          )
        })
        expect(fitView).toHaveBeenCalledWith({ padding: 0.15 })
        act(() => {
          const entry = observed as {
            callback: ResizeObserverCallback
            observer: ResizeObserver
            target: Element
          } | null
          entry?.callback(
            [
              {
                target: entry.target,
                contentRect: { width: 400, height: 220 },
              } as ResizeObserverEntry,
            ],
            entry.observer,
          )
        })
        expect(fitView).toHaveBeenCalledTimes(1)
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('F6 identifies repeated names by project (mutation: omit project name from detail)', async () => {
      seedCrews([makeCrew({ id: 'crew-1', sessionIds: ['a'] })])
      seed(
        [
          makeSession({ id: 'a' }),
          makeSession({ id: 'b', name: 'Same name' }),
          makeSession({ id: 'c', name: 'Same name', projectId: 'project-2' }),
        ],
        [CLAUDE_CODE],
      )
      render(<MissionControl />)
      await switchToCanvas()
      fireEvent.click(
        await screen.findByRole('button', { name: /Add conversation/ }),
      )
      const panel = await screen.findByRole('region', {
        name: 'Add conversations',
      })
      expect(
        within(panel).queryAllByText(
          /claude-code · claude-opus-5 · (Convergence|Emergence)/,
        ),
      ).toHaveLength(2)
    })
  })
})
