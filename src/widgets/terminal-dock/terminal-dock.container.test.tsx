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
    onClose,
  }: {
    onSplitHorizontal: () => void
    onSplitVertical: () => void
    onClose: () => void
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
      <button type="button" aria-label="Close tab" onClick={onClose}>
        x
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
        dockHeightBySessionId: {},
        dockVisibleBySessionId: {},
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
      fireEvent.keyDown(window, { key: 'k', metaKey: true })
      expect(xtermClearSpy).toHaveBeenCalledWith('t-1')
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

    it('Cmd-T opens the first pane when the session has no tree', () => {
      useSessionStore.setState({
        sessions: [makeSession()],
        activeSessionId: 's-1',
      } as Partial<ReturnType<typeof useSessionStore.getState>>)
      const openFirstPaneSpy = vi
        .spyOn(useTerminalStore.getState(), 'openFirstPane')
        .mockResolvedValue({ leafId: 'l1', tab: makeTab('t-1') })

      render(<TerminalDock />)
      fireEvent.keyDown(window, { key: 't', metaKey: true })

      expect(openFirstPaneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 's-1',
          cwd: '/tmp/session-cwd',
        }),
      )
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
