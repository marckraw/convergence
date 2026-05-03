import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

const setActiveSessionMock = vi.fn()
const setPrimarySurfaceMock = vi.fn()

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    projectId: 'p1',
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: 'Session',
    status: 'idle' as const,
    attention: 'none' as const,
    activity: null,
    contextWindow: null,
    workingDirectory: '/work',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation' as const,
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  }
}

let sessions: ReturnType<typeof baseSession>[] = []
let activeSessionId: string | null = 's1'

vi.mock('@/entities/session', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeSessionId,
      sessions,
      setActiveSession: setActiveSessionMock,
      setPrimarySurface: setPrimarySurfaceMock,
    }),
}))

let dockPlacementBySessionId: Record<string, 'bottom' | 'left' | 'right'> = {}

vi.mock('@/entities/terminal', () => ({
  useTerminalStore: (selector: (state: unknown) => unknown) =>
    selector({ dockPlacementBySessionId }),
}))

vi.mock('@/widgets/session-view', () => ({
  SessionView: () => <div data-testid="session-view">SessionView</div>,
}))

vi.mock('@/widgets/terminal-dock', () => ({
  TerminalDock: ({ mode }: { mode?: 'dock' | 'main' }) => (
    <div data-testid="terminal-dock" data-mode={mode ?? 'dock'}>
      TerminalDock
    </div>
  ),
}))

import { WorkspaceLayoutContainer } from './workspace-layout.container'

describe('WorkspaceLayoutContainer', () => {
  beforeEach(() => {
    setActiveSessionMock.mockReset()
    setPrimarySurfaceMock.mockReset()
    sessions = [baseSession()]
    activeSessionId = 's1'
    dockPlacementBySessionId = {}
  })

  it('renders SessionView in main with TerminalDock below for conversation-primary sessions', () => {
    render(<WorkspaceLayoutContainer />)
    expect(screen.getByTestId('session-view')).toBeInTheDocument()
    const dock = screen.getByTestId('terminal-dock')
    expect(dock.getAttribute('data-mode')).toBe('dock')
  })

  it('renders TerminalDock main + conversation placeholder dock for terminal-primary sessions', () => {
    sessions = [baseSession({ primarySurface: 'terminal' })]
    render(<WorkspaceLayoutContainer />)
    const dock = screen.getByTestId('terminal-dock')
    expect(dock.getAttribute('data-mode')).toBe('main')
    expect(
      screen.queryByTestId('conversation-dock-placeholder'),
    ).not.toBeInTheDocument()
  })

  it('Cmd+J toggles conversation placeholder visibility when terminal-primary', () => {
    sessions = [baseSession({ primarySurface: 'terminal' })]
    render(<WorkspaceLayoutContainer />)

    act(() => {
      fireEvent.keyDown(window, { key: 'j', metaKey: true })
    })

    expect(
      screen.getByTestId('conversation-dock-placeholder'),
    ).toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(window, { key: 'j', metaKey: true })
    })

    expect(
      screen.queryByTestId('conversation-dock-placeholder'),
    ).not.toBeInTheDocument()
  })

  it('does not intercept Cmd+J for conversation-primary sessions', () => {
    render(<WorkspaceLayoutContainer />)
    act(() => {
      fireEvent.keyDown(window, { key: 'j', metaKey: true })
    })
    expect(
      screen.queryByTestId('conversation-dock-placeholder'),
    ).not.toBeInTheDocument()
  })

  it('falls back to conversation layout when no session is active', () => {
    activeSessionId = null
    sessions = []
    render(<WorkspaceLayoutContainer />)
    expect(screen.getByTestId('session-view')).toBeInTheDocument()
  })

  it('renders bottom dock placement by default', () => {
    render(<WorkspaceLayoutContainer />)
    expect(
      screen
        .getByTestId('workspace-layout')
        .getAttribute('data-dock-placement'),
    ).toBe('bottom')
  })

  it('renders side dock placement when terminal store reports left/right', () => {
    dockPlacementBySessionId = { s1: 'right' }
    render(<WorkspaceLayoutContainer />)
    expect(
      screen
        .getByTestId('workspace-layout')
        .getAttribute('data-dock-placement'),
    ).toBe('right')
  })

  it('forces bottom placement for terminal-primary sessions even when store says side', () => {
    sessions = [baseSession({ primarySurface: 'terminal' })]
    dockPlacementBySessionId = { s1: 'left' }
    render(<WorkspaceLayoutContainer />)
    expect(
      screen
        .getByTestId('workspace-layout')
        .getAttribute('data-dock-placement'),
    ).toBe('bottom')
  })
})
