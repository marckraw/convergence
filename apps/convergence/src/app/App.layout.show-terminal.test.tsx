import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { useSessionStore, type Session } from '@/entities/session'
import { useSessionCrewStore } from '@/entities/session-crew'
import { useTerminalStore, type PaneTree } from '@/entities/terminal'
import { useWorkLedgerStore } from '@/entities/work-ledger'
import { TooltipProvider } from '@convergence/ui'
import { AppShell } from './App.layout'

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}))

// The conversation itself is not under test here, only the dock beside it.
vi.mock('@/widgets/session-view', () => ({
  SessionView: () => <div data-testid="session-view-stub" />,
}))

// A shell in a pane needs a real terminal (xterm); the pane's place is enough.
vi.mock('@/features/terminal-pane', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/terminal-pane')>()),
  TerminalPaneContainer: ({ tabId }: { tabId: string }) => (
    <div data-testid="terminal-pane-stub">{tabId}</div>
  ),
}))

/**
 * Show terminal's wiring, through the real shell (MAR-3608).
 *
 * The control's own tests render it beside the dock; this one is about the
 * one decision `App.layout` makes for it -- whether the status bar carries
 * it at all, which it should only while the workspace, and so the dock, is
 * what the window shows. One prop wide, and the kind of wiring that goes
 * missing in a refactor with every other gate still green.
 */

const AT = '2026-10-02T00:00:00.000Z'

function conversation(): Session {
  return {
    id: 's-1',
    contextKind: 'project',
    projectId: 'project-one',
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: 'Session',
    status: 'idle',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp/session-cwd',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 0,
    createdAt: AT,
    updatedAt: AT,
  }
}

/** Two terminals in one pane. */
const TREE: PaneTree = {
  kind: 'leaf',
  id: 'l1',
  activeTabId: 't-1',
  tabs: ['t-1', 't-2'].map((id) => ({
    id,
    cwd: '/tmp/session-cwd',
    title: 'zsh',
    pid: 1000,
    shell: '/bin/zsh',
    status: 'running' as const,
    exitCode: null,
  })),
}

function stubBridge() {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    crew: {
      list: vi.fn(async () => []),
      onUpdated: vi.fn(() => () => {}),
    },
    workLedger: {
      list: vi.fn(async (crewId: string) => ({
        crewId,
        entries: [],
        trackerHealth: {
          state: 'ok',
          since: AT,
          lastOkAt: AT,
          backoffUntil: null,
        },
      })),
      onUpdated: vi.fn(() => () => {}),
    },
    session: { getAllSummaries: vi.fn(async () => []) },
    relay: {
      list: vi.fn(async () => []),
      listHops: vi.fn(async () => []),
      listRuns: vi.fn(async () => ({
        runs: [],
        unattributedHails: [],
        outcomes: {},
        hasMore: false,
      })),
      onUpdated: vi.fn(() => () => {}),
      onHopAppended: vi.fn(() => () => {}),
      onHopSettled: vi.fn(() => () => {}),
      onHopsCleared: vi.fn(() => () => {}),
    },
    crewHail: {
      listOpen: vi.fn(async () => []),
      acknowledge: vi.fn(),
      acknowledgeCrew: vi.fn(),
      onUpdated: vi.fn(() => () => {}),
    },
    providerAccounts: { list: vi.fn(async () => []) },
  }
}

const noop = () => {}

async function renderShell(props: Record<string, unknown> = {}) {
  await act(async () => {
    render(
      <TooltipProvider>
        <AppShell
          activeSessionId="s-1"
          activeGlobalSessionId={null}
          onSelectSession={noop}
          onSelectGlobalSession={noop}
          selectedChatSpaceId={null}
          draftChatSpaceId={null}
          onSelectChatSession={noop}
          loading={false}
          hasProject
          showDevelopmentRibbon={false}
          {...props}
        />
      </TooltipProvider>,
    )
  })
  await act(async () => {
    await Promise.resolve()
  })
}

const statusBar = () => within(screen.getByTestId('global-status-bar'))

describe('MAR-3608: Show terminal’s wiring in the shell', () => {
  const initialSessionState = useSessionStore.getState()
  const initialTerminalState = useTerminalStore.getState()

  beforeEach(() => {
    localStorage.clear()
    stubBridge()
    useSessionCrewStore.setState({ crews: [] })
    useWorkLedgerStore.setState({
      snapshots: {},
      broadcastCount: {},
      error: null,
      unsubscribeBroadcast: null,
    })
    useSessionStore.setState(
      {
        ...initialSessionState,
        sessions: [conversation()],
        globalSessions: [],
        activeSessionId: 's-1',
      },
      true,
    )
    // Terminals open, the dock put away.
    useTerminalStore.setState(
      {
        ...initialTerminalState,
        treesBySessionId: { 's-1': TREE },
        focusedLeafBySessionId: { 's-1': 'l1' },
        dockVisibleBySessionId: { 's-1': false },
      },
      true,
    )
  })

  afterEach(() => {
    cleanup()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  // Mutation: drop the status bar's terminalSlot in App.layout -> red.
  it('the workspace on screen with its dock hidden: the status bar shows it, and it brings the dock back', async () => {
    await renderShell()
    expect(screen.queryByTestId('terminal-dock')).toBeNull()

    const show = statusBar().getByRole('button', { name: 'Show terminal' })
    expect(show).toHaveTextContent('2')
    await act(async () => {
      show.click()
    })

    expect(screen.getByTestId('terminal-dock')).toBeInTheDocument()
    expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(1)
    expect(
      statusBar().queryByRole('button', { name: 'Show terminal' }),
    ).toBeNull()
  })

  // Mutation: drop `!missionControlActive` from workspaceOnScreen -> red.
  it('Mission Control has the window: no dock there to bring back, so no Show terminal', async () => {
    await renderShell({ missionControlActive: true })

    expect(
      statusBar().queryByRole('button', { name: 'Show terminal' }),
    ).toBeNull()
  })
})
