import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/entities/session'
import type { Session } from '@/entities/session'
import { useTerminalStore } from '@/entities/terminal'
import type {
  LeafNode,
  PaneTree,
  SplitNode,
  TerminalTab,
} from '@/entities/terminal'

vi.mock('@/features/terminal-pane', async () => {
  const actual = await vi.importActual<object>('@/features/terminal-pane')
  return {
    ...actual,
    TerminalPaneContainer: ({
      sessionId,
      tabId,
    }: {
      sessionId: string
      tabId: string
    }) => (
      <div data-testid="terminal-pane-stub">
        {sessionId}:{tabId}
      </div>
    ),
  }
})

import { TerminalDock } from './index'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    projectId: 'project-one',
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: 'Session',
    status: 'idle',
    attention: 'none',
    workingDirectory: '/tmp/session-cwd',
    transcript: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeTab(
  id: string,
  overrides: Partial<TerminalTab> = {},
): TerminalTab {
  return {
    id,
    cwd: '/tmp/session-cwd',
    title: 'zsh',
    pid: 1000,
    shell: '/bin/zsh',
    status: 'running',
    exitCode: null,
    ...overrides,
  }
}

function leaf(id: string, tabs: TerminalTab[]): LeafNode {
  return {
    kind: 'leaf',
    id,
    tabs,
    activeTabId: tabs[0]!.id,
  }
}

function split(
  id: string,
  direction: 'horizontal' | 'vertical',
  children: PaneTree[],
): SplitNode {
  return {
    kind: 'split',
    id,
    direction,
    children,
    sizes: children.map(() => 100 / children.length),
  }
}

const initialSessionState = useSessionStore.getState()
const initialTerminalState = useTerminalStore.getState()

describe('TerminalDock container', () => {
  beforeEach(() => {
    useSessionStore.setState(
      {
        ...initialSessionState,
        sessions: [],
        globalSessions: [],
        activeSessionId: null,
      },
      true,
    )
    useTerminalStore.setState(
      {
        ...initialTerminalState,
        treesBySessionId: {},
        focusedLeafBySessionId: {},
      },
      true,
    )
  })

  it('renders nothing when there is no active session', () => {
    const { container } = render(<TerminalDock />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the active session has no terminal tree', () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      activeSessionId: 's-1',
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    const { container } = render(<TerminalDock />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the leaf pane when the active session has a single-leaf tree', () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      activeSessionId: 's-1',
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    useTerminalStore.setState({
      treesBySessionId: { 's-1': leaf('l1', [makeTab('t-1')]) },
      focusedLeafBySessionId: { 's-1': 'l1' },
    })

    render(<TerminalDock />)

    expect(screen.getByTestId('terminal-dock')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-pane-stub')).toHaveTextContent(
      's-1:t-1',
    )
  })

  it('renders only the active tab of a leaf with multiple tabs', () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      activeSessionId: 's-1',
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    const twoTabLeaf: LeafNode = {
      kind: 'leaf',
      id: 'l1',
      tabs: [makeTab('t-1'), makeTab('t-2')],
      activeTabId: 't-2',
    }
    useTerminalStore.setState({
      treesBySessionId: { 's-1': twoTabLeaf },
      focusedLeafBySessionId: { 's-1': 'l1' },
    })

    render(<TerminalDock />)

    const stubs = screen.getAllByTestId('terminal-pane-stub')
    expect(stubs).toHaveLength(1)
    expect(stubs[0]).toHaveTextContent('s-1:t-2')
  })

  it('renders one pane per leaf across a split tree', () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      activeSessionId: 's-1',
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    const tree = split('s1', 'horizontal', [
      leaf('l1', [makeTab('t-1')]),
      leaf('l2', [makeTab('t-2')]),
    ])
    useTerminalStore.setState({
      treesBySessionId: { 's-1': tree },
      focusedLeafBySessionId: { 's-1': 'l1' },
    })

    render(<TerminalDock />)

    const stubs = screen.getAllByTestId('terminal-pane-stub')
    expect(stubs).toHaveLength(2)
    expect(stubs.map((n) => n.textContent)).toEqual(['s-1:t-1', 's-1:t-2'])
  })

  it('clicking "New tab" dispatches newTab for the leaf', async () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      activeSessionId: 's-1',
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    useTerminalStore.setState({
      treesBySessionId: { 's-1': leaf('l1', [makeTab('t-1')]) },
      focusedLeafBySessionId: { 's-1': 'l1' },
    })
    const newTabSpy = vi
      .spyOn(useTerminalStore.getState(), 'newTab')
      .mockResolvedValue(makeTab('t-2'))

    render(<TerminalDock />)
    fireEvent.click(screen.getByRole('button', { name: /new tab/i }))

    expect(newTabSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's-1',
        leafId: 'l1',
        cwd: '/tmp/session-cwd',
      }),
    )
  })

  it('clicking "Split vertical" dispatches splitLeaf vertical', () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      activeSessionId: 's-1',
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    useTerminalStore.setState({
      treesBySessionId: { 's-1': leaf('l1', [makeTab('t-1')]) },
      focusedLeafBySessionId: { 's-1': 'l1' },
    })
    const splitSpy = vi
      .spyOn(useTerminalStore.getState(), 'splitLeaf')
      .mockResolvedValue({ leafId: 'l2', tab: makeTab('t-2') })

    render(<TerminalDock />)
    fireEvent.click(screen.getByRole('button', { name: /split vertical/i }))

    expect(splitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's-1',
        leafId: 'l1',
        direction: 'vertical',
      }),
    )
  })

  it('clicking "Close tab" closes the active tab of the leaf', () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      activeSessionId: 's-1',
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    useTerminalStore.setState({
      treesBySessionId: { 's-1': leaf('l1', [makeTab('t-1')]) },
      focusedLeafBySessionId: { 's-1': 'l1' },
    })
    const closeSpy = vi
      .spyOn(useTerminalStore.getState(), 'closeTab')
      .mockResolvedValue(undefined)

    render(<TerminalDock />)
    fireEvent.click(screen.getByRole('button', { name: /^close tab$/i }))

    expect(closeSpy).toHaveBeenCalledWith('s-1', 'l1', 't-1')
  })
})
