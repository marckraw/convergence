import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDialogStore } from '@/entities/dialog'
import { SessionIntentDialogContainer } from './session-intent-dialog.container'

const beginSessionDraftMock = vi.fn()
const createTerminalSessionMock = vi.fn()

vi.mock('@/entities/session', () => ({
  useSessionStore: (
    selector: (state: {
      beginSessionDraft: typeof beginSessionDraftMock
      createTerminalSession: typeof createTerminalSessionMock
    }) => unknown,
  ) =>
    selector({
      beginSessionDraft: beginSessionDraftMock,
      createTerminalSession: createTerminalSessionMock,
    }),
}))

vi.mock('@/entities/project', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({ activeProject: { id: 'p1', name: 'Proj' } }),
}))

vi.mock('@/entities/workspace', () => ({
  useWorkspaceStore: (selector: (state: unknown) => unknown) =>
    selector({
      workspaces: [
        { id: 'ws-1', branchName: 'feature/x' },
        { id: 'ws-2', branchName: 'main' },
      ],
    }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

describe('SessionIntentDialogContainer', () => {
  beforeEach(() => {
    beginSessionDraftMock.mockReset()
    createTerminalSessionMock.mockReset()
    createTerminalSessionMock.mockResolvedValue({
      id: 'new-session',
      providerId: 'shell',
      primarySurface: 'terminal',
    })
    useDialogStore.setState({
      openDialog: 'session-intent',
      payload: { workspaceId: 'ws-1' },
      open: vi.fn(),
      close: vi.fn(),
    })
  })

  it('renders both intent options when the dialog is open', () => {
    render(<SessionIntentDialogContainer />)

    expect(
      screen.getByTestId('session-intent-conversation'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('session-intent-terminal')).toBeInTheDocument()
  })

  it('picking Conversation closes the dialog and begins an inline draft for the payload workspace', () => {
    const close = vi.fn()
    useDialogStore.setState({
      openDialog: 'session-intent',
      payload: { workspaceId: 'ws-1' },
      open: vi.fn(),
      close,
    })

    render(<SessionIntentDialogContainer />)

    fireEvent.click(screen.getByTestId('session-intent-conversation'))

    expect(close).toHaveBeenCalled()
    expect(beginSessionDraftMock).toHaveBeenCalledWith('ws-1')
  })

  it('picking Terminal creates a shell session in the payload workspace, with a name derived from the branch, and closes the dialog', async () => {
    const close = vi.fn()
    useDialogStore.setState({
      openDialog: 'session-intent',
      payload: { workspaceId: 'ws-1' },
      open: vi.fn(),
      close,
    })

    render(<SessionIntentDialogContainer />)

    fireEvent.click(screen.getByTestId('session-intent-terminal'))

    await waitFor(() => {
      expect(createTerminalSessionMock).toHaveBeenCalledTimes(1)
    })
    expect(createTerminalSessionMock).toHaveBeenCalledWith(
      'p1',
      'ws-1',
      'Terminal — feature/x',
    )
    await waitFor(() => {
      expect(close).toHaveBeenCalled()
    })
  })

  it('picking Terminal at project root passes null workspaceId and a plain "Terminal" name', async () => {
    useDialogStore.setState({
      openDialog: 'session-intent',
      payload: { workspaceId: null },
      open: vi.fn(),
      close: vi.fn(),
    })

    render(<SessionIntentDialogContainer />)

    fireEvent.click(screen.getByTestId('session-intent-terminal'))

    await waitFor(() => {
      expect(createTerminalSessionMock).toHaveBeenCalledWith(
        'p1',
        null,
        'Terminal',
      )
    })
  })
})
