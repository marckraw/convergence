import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/entities/session'
import type { Session } from '@/entities/session'
import { useTerminalStore, terminalApi } from '@/entities/terminal'
import type {
  LeafNode,
  PaneTree,
  SplitNode,
  TerminalTab,
} from '@/entities/terminal'

const xtermClearSpy = vi.fn()

vi.mock('@/features/terminal-pane', () => ({
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
  PaneToolbar: ({
    onSplitHorizontal,
    onSplitVertical,
  }: {
    onSplitHorizontal: () => void
    onSplitVertical: () => void
  }) => (
    <div>
      <button
        type="button"
        aria-label="Split horizontal"
        onClick={onSplitHorizontal}
      >
        h
      </button>
      <button
        type="button"
        aria-label="Split vertical"
        onClick={onSplitVertical}
      >
        v
      </button>
    </div>
  ),
  CloseConfirmDialog: ({
    request,
    onConfirm,
    onCancel,
  }: {
    request: {
      sessionId: string
      leafId: string
      tabId: string
      process: { pid: number; name: string }
    } | null
    onConfirm: (req: {
      sessionId: string
      leafId: string
      tabId: string
      process: { pid: number; name: string }
    }) => void
    onCancel: () => void
  }) =>
    request ? (
      <div data-testid="close-confirm">
        <div data-testid="close-confirm-name">{request.process.name}</div>
        <button
          type="button"
          aria-label="Confirm close"
          onClick={() => onConfirm(request)}
        >
          confirm
        </button>
        <button type="button" aria-label="Cancel close" onClick={onCancel}>
          cancel
        </button>
      </div>
    ) : null,
  xtermRegistry: {
    register: () => () => undefined,
    clear: (tabId: string) => {
      xtermClearSpy(tabId)
      return true
    },
    has: () => true,
  },
}))

import { ShowTerminal, TerminalDock } from './index'

function makeSession(overrides: Partial<Session> = {}): Session {
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
    primarySurface: 'conversation' as const,
    continuationToken: null,
    lastSequence: 0,
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
        dockHeightBySessionId: {},
        dockWidthBySessionId: {},
        dockVisibleBySessionId: {},
        dockPlacementBySessionId: {},
      },
      true,
    )
    xtermClearSpy.mockReset()
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

  // NAV-16: the line between the dock and the conversation is the kit's
  // ResizeHandle. Mutation: the old pointer-only div -> no tab stop, no
  // value, and the keys do nothing: red.
  it('the dock resizes from the keyboard, and says its size and range', () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      activeSessionId: 's-1',
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    useTerminalStore.setState({
      treesBySessionId: { 's-1': leaf('l1', [makeTab('t-1')]) },
      focusedLeafBySessionId: { 's-1': 'l1' },
    })
    // jsdom's window is 768 px tall: the dock may take 60% of it.
    const max = String(Math.floor(window.innerHeight * 0.6))

    render(<TerminalDock />)

    const line = screen.getByRole('separator', { name: 'Resize terminal dock' })
    expect(line).toHaveAttribute('tabindex', '0')
    expect(line).toHaveAttribute('aria-orientation', 'horizontal')
    expect(line).toHaveAttribute('aria-valuenow', '280')
    expect(line).toHaveAttribute('aria-valuemin', '120')
    expect(line).toHaveAttribute('aria-valuemax', max)

    // The dock is under the line: moving it up makes the dock taller.
    fireEvent.keyDown(line, { key: 'ArrowUp' })
    expect(useTerminalStore.getState().getDockHeight('s-1')).toBe(296)
    expect(line).toHaveAttribute('aria-valuenow', '296')
    fireEvent.keyDown(line, { key: 'End' })
    expect(String(useTerminalStore.getState().getDockHeight('s-1'))).toBe(max)
    // A double-click puts the default back.
    fireEvent.doubleClick(line)
    expect(useTerminalStore.getState().getDockHeight('s-1')).toBe(280)
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

  it('closes a tab from its own ✕, the only close it has (NAV-9, NAV N4: the toolbar has none)', () => {
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
    // The pane's toolbar draws no second close for the open tab.
    expect(screen.queryByRole('button', { name: /^close tab$/i })).toBeNull()
    // The tab's ✕ is the pointer's (Delete is the keyboard's), so it is out of
    // the accessibility tree.
    fireEvent.click(
      screen.getByRole('button', { name: 'Close tab zsh', hidden: true }),
    )

    expect(closeSpy).toHaveBeenCalledWith('s-1', 'l1', 't-1')
  })

  // MAR-3608: ⌘` hid the dock with nothing on screen saying so. Hide
  // terminal is that key's action on a button, and says the key. Mutation:
  // drop the container's onHide (or the button's onClick) -> the dock stays:
  // red.
  it('Hide terminal hides the dock, as Cmd-` does, and leaves its terminals running', () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      activeSessionId: 's-1',
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    useTerminalStore.setState({
      treesBySessionId: { 's-1': leaf('l1', [makeTab('t-1')]) },
      focusedLeafBySessionId: { 's-1': 'l1' },
    })
    const closeAllSpy = vi.spyOn(
      useTerminalStore.getState(),
      'closeAllForSession',
    )
    const closeTabSpy = vi.spyOn(useTerminalStore.getState(), 'closeTab')

    render(<TerminalDock />)
    const hide = screen.getByRole('button', { name: 'Hide terminal' })
    // Its tooltip says the key (the tests run as a Mac).
    expect(hide).toHaveAttribute('data-tooltip-shortcut', '⌘`')
    fireEvent.click(hide)

    expect(screen.queryByTestId('terminal-dock')).toBeNull()
    expect(useTerminalStore.getState().isDockVisible('s-1')).toBe(false)
    // Hidden, not closed: the header's Close terminal is the one that ends
    // them. The tree stays, and nothing was closed.
    expect(useTerminalStore.getState().getTree('s-1')).not.toBeNull()
    expect(closeAllSpy).not.toHaveBeenCalled()
    expect(closeTabSpy).not.toHaveBeenCalled()
  })

  it('draws one Hide terminal, on the pane at the dock’s top-right corner', () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      activeSessionId: 's-1',
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    const tree = split('s1', 'horizontal', [
      leaf('l1', [makeTab('t-1')]),
      split('s2', 'vertical', [
        leaf('l2', [makeTab('t-2')]),
        leaf('l3', [makeTab('t-3')]),
      ]),
    ])
    useTerminalStore.setState({
      treesBySessionId: { 's-1': tree },
      focusedLeafBySessionId: { 's-1': 'l1' },
    })

    render(<TerminalDock />)

    const hides = screen.getAllByRole('button', { name: 'Hide terminal' })
    expect(hides).toHaveLength(1)
    expect(hides[0]!.closest('[data-leaf-id]')).toHaveAttribute(
      'data-leaf-id',
      'l2',
    )
  })

  it('draws no Hide terminal when the terminal is the main surface, where Cmd-` does nothing', () => {
    useSessionStore.setState({
      sessions: [makeSession({ primarySurface: 'terminal' })],
      activeSessionId: 's-1',
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    useTerminalStore.setState({
      treesBySessionId: { 's-1': leaf('l1', [makeTab('t-1')]) },
      focusedLeafBySessionId: { 's-1': 'l1' },
    })

    render(<TerminalDock mode="main" />)

    expect(screen.getByTestId('terminal-dock')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide terminal' })).toBeNull()
  })

  // MAR-3608: once hidden, the dock came back only through Cmd-`. Show
  // terminal is that way back on screen, in the window's status bar; the
  // shell renders it and the dock side by side, and so do these tests.
  describe('Show terminal', () => {
    type SessionState = ReturnType<typeof useSessionStore.getState>

    /** Three terminals in two panes, the dock hidden unless told otherwise. */
    function setup({
      primarySurface = 'conversation',
      dockVisible = false,
      withTerminals = true,
    }: {
      primarySurface?: Session['primarySurface']
      dockVisible?: boolean
      withTerminals?: boolean
    } = {}) {
      useSessionStore.setState({
        sessions: [makeSession({ primarySurface })],
        activeSessionId: 's-1',
      } as Partial<SessionState>)
      useTerminalStore.setState({
        treesBySessionId: {
          's-1': withTerminals
            ? split('s1', 'horizontal', [
                leaf('l1', [makeTab('t-1'), makeTab('t-2')]),
                leaf('l2', [makeTab('t-3')]),
              ])
            : null,
        },
        focusedLeafBySessionId: { 's-1': withTerminals ? 'l1' : null },
        dockVisibleBySessionId: { 's-1': dockVisible },
      })
    }

    const queryShow = () =>
      screen.queryByRole('button', { name: 'Show terminal' })

    // Mutation: drop the container's onShow (or the button's onClick) -> the
    // dock stays hidden: red.
    it('brings the hidden dock back, as Cmd-` does, with its terminals as they were', () => {
      setup()
      const closeAllSpy = vi.spyOn(
        useTerminalStore.getState(),
        'closeAllForSession',
      )
      render(
        <>
          <TerminalDock />
          <ShowTerminal />
        </>,
      )
      expect(screen.queryByTestId('terminal-dock')).toBeNull()

      const show = screen.getByRole('button', { name: 'Show terminal' })
      // Its tooltip says the key (the tests run as a Mac), and it says how
      // many terminals wait in the dock.
      expect(show).toHaveAttribute('data-tooltip-shortcut', '⌘`')
      expect(show).toHaveTextContent('3')
      expect(show).toHaveAccessibleDescription('3 terminals open')
      fireEvent.click(show)

      expect(screen.getByTestId('terminal-dock')).toBeInTheDocument()
      expect(useTerminalStore.getState().isDockVisible('s-1')).toBe(true)
      expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(2)
      expect(closeAllSpy).not.toHaveBeenCalled()
      expect(queryShow()).toBeNull()
    })

    it('is the way back from Hide terminal and from Cmd-`, and goes as the dock comes back', () => {
      setup({ dockVisible: true })
      render(
        <>
          <TerminalDock />
          <ShowTerminal />
        </>,
      )
      expect(queryShow()).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Hide terminal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Show terminal' }))
      expect(screen.getByTestId('terminal-dock')).toBeInTheDocument()
      expect(queryShow()).toBeNull()

      fireEvent.keyDown(window, { key: '`', metaKey: true })
      expect(screen.queryByTestId('terminal-dock')).toBeNull()
      expect(queryShow()).toBeInTheDocument()

      fireEvent.keyDown(window, { key: '`', metaKey: true })
      expect(screen.getByTestId('terminal-dock')).toBeInTheDocument()
      expect(queryShow()).toBeNull()
    })

    it('is absent while the dock is on screen', () => {
      setup({ dockVisible: true })
      render(<ShowTerminal />)
      expect(queryShow()).toBeNull()
    })

    it('is absent when the conversation has no terminals: Close terminal ended them', () => {
      setup({ withTerminals: false })
      render(<ShowTerminal />)
      expect(queryShow()).toBeNull()
    })

    it('is absent when the terminal is the main view, where there is no dock and Cmd-` does nothing', () => {
      setup({ primarySurface: 'terminal' })
      render(
        <>
          <TerminalDock mode="main" />
          <ShowTerminal />
        </>,
      )
      expect(screen.getByTestId('terminal-dock')).toBeInTheDocument()
      expect(queryShow()).toBeNull()
    })

    it('is absent with no conversation open', () => {
      render(<ShowTerminal />)
      expect(queryShow()).toBeNull()
    })
  })

  describe('keyboard shortcuts', () => {
    function setupSingleLeaf() {
      useSessionStore.setState({
        sessions: [makeSession()],
        activeSessionId: 's-1',
      } as Partial<ReturnType<typeof useSessionStore.getState>>)
      useTerminalStore.setState({
        treesBySessionId: { 's-1': leaf('l1', [makeTab('t-1')]) },
        focusedLeafBySessionId: { 's-1': 'l1' },
      })
    }

    function focusDock() {
      const buttons = screen.queryAllByRole('button')
      if (buttons.length > 0) buttons[0]!.focus()
    }

    it('Cmd-T dispatches newTab for the focused leaf', () => {
      setupSingleLeaf()
      const newTabSpy = vi
        .spyOn(useTerminalStore.getState(), 'newTab')
        .mockResolvedValue(makeTab('t-2'))

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 't', metaKey: true })

      expect(newTabSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 's-1', leafId: 'l1' }),
      )
    })

    it('Cmd-D dispatches splitLeaf vertical', () => {
      setupSingleLeaf()
      const splitSpy = vi
        .spyOn(useTerminalStore.getState(), 'splitLeaf')
        .mockResolvedValue({ leafId: 'l2', tab: makeTab('t-2') })

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 'd', metaKey: true })

      expect(splitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ direction: 'vertical' }),
      )
    })

    it('Cmd-Shift-D dispatches splitLeaf horizontal', () => {
      setupSingleLeaf()
      const splitSpy = vi
        .spyOn(useTerminalStore.getState(), 'splitLeaf')
        .mockResolvedValue({ leafId: 'l2', tab: makeTab('t-2') })

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 'D', metaKey: true, shiftKey: true })

      expect(splitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ direction: 'horizontal' }),
      )
    })

    it('Cmd-W closes directly when no foreground process is running', async () => {
      setupSingleLeaf()
      const closeSpy = vi
        .spyOn(useTerminalStore.getState(), 'closeTab')
        .mockResolvedValue(undefined)
      const fgSpy = vi
        .spyOn(terminalApi, 'getForegroundProcess')
        .mockResolvedValue(null)

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 'w', metaKey: true })

      await vi.waitFor(() => {
        expect(fgSpy).toHaveBeenCalledWith('t-1')
        expect(closeSpy).toHaveBeenCalledWith('s-1', 'l1', 't-1')
      })
    })

    it('Cmd-W shows close-confirm modal when a process is running', async () => {
      setupSingleLeaf()
      const closeSpy = vi
        .spyOn(useTerminalStore.getState(), 'closeTab')
        .mockResolvedValue(undefined)
      vi.spyOn(terminalApi, 'getForegroundProcess').mockResolvedValue({
        pid: 9999,
        name: 'sleep',
      })

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 'w', metaKey: true })

      await vi.waitFor(() => {
        expect(screen.getByTestId('close-confirm-name')).toHaveTextContent(
          'sleep',
        )
      })
      expect(closeSpy).not.toHaveBeenCalled()
    })

    it('confirming close-confirm modal calls closeTab', async () => {
      setupSingleLeaf()
      const closeSpy = vi
        .spyOn(useTerminalStore.getState(), 'closeTab')
        .mockResolvedValue(undefined)
      vi.spyOn(terminalApi, 'getForegroundProcess').mockResolvedValue({
        pid: 9999,
        name: 'sleep',
      })

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 'w', metaKey: true })

      const confirm = await screen.findByRole('button', {
        name: /confirm close/i,
      })
      fireEvent.click(confirm)

      expect(closeSpy).toHaveBeenCalledWith('s-1', 'l1', 't-1')
    })

    it('cancelling close-confirm modal does not call closeTab', async () => {
      setupSingleLeaf()
      const closeSpy = vi
        .spyOn(useTerminalStore.getState(), 'closeTab')
        .mockResolvedValue(undefined)
      vi.spyOn(terminalApi, 'getForegroundProcess').mockResolvedValue({
        pid: 9999,
        name: 'sleep',
      })

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 'w', metaKey: true })

      const cancel = await screen.findByRole('button', {
        name: /cancel close/i,
      })
      fireEvent.click(cancel)

      expect(closeSpy).not.toHaveBeenCalled()
    })

    it('Cmd-K calls xterm clear on the focused active tab', () => {
      setupSingleLeaf()
      render(<TerminalDock />)
      focusDock()
      fireEvent.keyDown(window, { key: 'k', metaKey: true })
      expect(xtermClearSpy).toHaveBeenCalledWith('t-1')
    })

    it('Cmd-K does not clear when focus is outside the dock', () => {
      setupSingleLeaf()
      render(<TerminalDock />)
      // focus stays on document.body by default — outside the dock root
      fireEvent.keyDown(window, { key: 'k', metaKey: true })
      expect(xtermClearSpy).not.toHaveBeenCalled()
    })

    it('Cmd-Shift-] cycles to the next tab', () => {
      useSessionStore.setState({
        sessions: [makeSession()],
        activeSessionId: 's-1',
      } as Partial<ReturnType<typeof useSessionStore.getState>>)
      const twoTabs: LeafNode = {
        kind: 'leaf',
        id: 'l1',
        tabs: [makeTab('t-1'), makeTab('t-2')],
        activeTabId: 't-1',
      }
      useTerminalStore.setState({
        treesBySessionId: { 's-1': twoTabs },
        focusedLeafBySessionId: { 's-1': 'l1' },
      })
      const setActiveSpy = vi.spyOn(useTerminalStore.getState(), 'setActiveTab')

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: ']', metaKey: true, shiftKey: true })

      expect(setActiveSpy).toHaveBeenCalledWith('s-1', 'l1', 't-2')
    })

    it('Cmd-Alt-Right moves focus to adjacent leaf', () => {
      useSessionStore.setState({
        sessions: [makeSession()],
        activeSessionId: 's-1',
      } as Partial<ReturnType<typeof useSessionStore.getState>>)
      const splitTree = split('s1', 'horizontal', [
        leaf('l1', [makeTab('t-1')]),
        leaf('l2', [makeTab('t-2')]),
      ])
      useTerminalStore.setState({
        treesBySessionId: { 's-1': splitTree },
        focusedLeafBySessionId: { 's-1': 'l1' },
      })
      const focusSpy = vi.spyOn(useTerminalStore.getState(), 'setFocusedLeaf')

      render(<TerminalDock />)
      fireEvent.keyDown(window, {
        key: 'ArrowRight',
        metaKey: true,
        altKey: true,
      })

      expect(focusSpy).toHaveBeenCalledWith('s-1', 'l2')
    })

    it('Cmd-T shows the dock when hidden', () => {
      setupSingleLeaf()
      useTerminalStore.setState((state) => ({
        ...state,
        dockVisibleBySessionId: { 's-1': false },
      }))
      const setVisibleSpy = vi.spyOn(
        useTerminalStore.getState(),
        'setDockVisible',
      )
      vi.spyOn(useTerminalStore.getState(), 'newTab').mockResolvedValue(
        makeTab('t-2'),
      )

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 't', metaKey: true })

      expect(setVisibleSpy).toHaveBeenCalledWith('s-1', true)
    })

    it('Cmd-T hydrates the pane tree when the session has no tree', () => {
      useSessionStore.setState({
        sessions: [makeSession()],
        activeSessionId: 's-1',
      } as Partial<ReturnType<typeof useSessionStore.getState>>)
      const hydrateSpy = vi
        .spyOn(useTerminalStore.getState(), 'hydratePaneTree')
        .mockResolvedValue({ leafId: 'l1', tab: makeTab('t-1') })

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 't', metaKey: true })

      expect(hydrateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 's-1',
          cwd: '/tmp/session-cwd',
        }),
      )
    })

    it('Cmd-Shift-T cycles dock placement', () => {
      setupSingleLeaf()
      const cycleSpy = vi.spyOn(
        useTerminalStore.getState(),
        'cycleDockPlacement',
      )

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 'T', metaKey: true, shiftKey: true })

      expect(cycleSpy).toHaveBeenCalledWith('s-1')
    })

    it('Cmd-Shift-T re-shows the dock when it was hidden', () => {
      setupSingleLeaf()
      useTerminalStore.setState((state) => ({
        ...state,
        dockVisibleBySessionId: { 's-1': false },
      }))
      const setVisibleSpy = vi.spyOn(
        useTerminalStore.getState(),
        'setDockVisible',
      )

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 'T', metaKey: true, shiftKey: true })

      expect(setVisibleSpy).toHaveBeenCalledWith('s-1', true)
    })

    it('Cmd-` toggles dock visibility', () => {
      setupSingleLeaf()
      const toggleSpy = vi.spyOn(
        useTerminalStore.getState(),
        'toggleDockVisible',
      )

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: '`', metaKey: true })

      expect(toggleSpy).toHaveBeenCalledWith('s-1')
    })

    it('does not render dock when dockVisible is false', () => {
      setupSingleLeaf()
      useTerminalStore.setState((state) => ({
        ...state,
        dockVisibleBySessionId: { 's-1': false },
      }))

      const { queryByTestId } = render(<TerminalDock />)
      expect(queryByTestId('terminal-dock')).toBeNull()
    })
  })
})
