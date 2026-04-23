import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDialogStore } from '@/entities/dialog'
import { TerminalSessionCreateDialogContainer } from './terminal-session-create.container'

const setActiveSessionMock = vi.fn()
const createSessionMock = vi.fn()

vi.mock('@/entities/project', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeProject: { id: 'p1', name: 'Proj' },
    }),
}))

vi.mock('@/entities/session', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      setActiveSession: setActiveSessionMock,
    }),
  sessionApi: {
    create: (...args: unknown[]) => createSessionMock(...args),
  },
}))

vi.mock('@/entities/workspace', () => ({
  useWorkspaceStore: (selector: (state: unknown) => unknown) =>
    selector({
      workspaces: [
        { id: 'ws-1', branchName: 'feature', path: '/w/1' },
        { id: 'ws-2', branchName: 'main', path: '/w/2' },
      ],
    }),
}))

describe('TerminalSessionCreateDialogContainer', () => {
  beforeEach(() => {
    setActiveSessionMock.mockReset()
    createSessionMock.mockReset()
    createSessionMock.mockResolvedValue({
      id: 'new-session',
      providerId: 'shell',
      primarySurface: 'terminal',
    })
    useDialogStore.setState({
      openDialog: 'terminal-session-create',
      payload: { workspaceId: 'ws-1' },
      open: vi.fn(),
      close: vi.fn(),
    })
  })

  it('creates a shell-provider session with the selected workspace', async () => {
    const close = vi.fn()
    useDialogStore.setState({
      openDialog: 'terminal-session-create',
      payload: { workspaceId: 'ws-1' },
      open: vi.fn(),
      close,
    })

    render(<TerminalSessionCreateDialogContainer />)

    fireEvent.click(screen.getByTestId('terminal-session-submit'))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledTimes(1)
    })
    expect(createSessionMock).toHaveBeenCalledWith({
      projectId: 'p1',
      workspaceId: 'ws-1',
      providerId: 'shell',
      model: null,
      effort: null,
      name: 'Terminal',
      primarySurface: 'terminal',
    })
    expect(setActiveSessionMock).toHaveBeenCalledWith('new-session')
    expect(close).toHaveBeenCalled()
  })

  it('requires a non-empty name', () => {
    render(<TerminalSessionCreateDialogContainer />)

    fireEvent.change(screen.getByTestId('terminal-session-name-input'), {
      target: { value: '  ' },
    })
    fireEvent.click(screen.getByTestId('terminal-session-submit'))

    expect(screen.getByTestId('terminal-session-name-error')).toBeInTheDocument()
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('offers project root and workspace branches as options', () => {
    render(<TerminalSessionCreateDialogContainer />)

    const group = screen.getByTestId('terminal-session-workspace-options')
    expect(group.textContent).toContain('Project root (Proj)')
    expect(group.textContent).toContain('feature')
    expect(group.textContent).toContain('main')
  })
})
