import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDialogStore } from '@/entities/dialog'
import { SessionIntentDialogContainer } from './session-intent-dialog.container'

const beginSessionDraftMock = vi.fn()
const setActiveSessionMock = vi.fn()
const createSessionMock = vi.fn()

vi.mock('@/entities/session', () => ({
  useSessionStore: (
    selector: (state: {
      beginSessionDraft: typeof beginSessionDraftMock
      setActiveSession: typeof setActiveSessionMock
    }) => unknown,
  ) =>
    selector({
      beginSessionDraft: beginSessionDraftMock,
      setActiveSession: setActiveSessionMock,
    }),
  sessionApi: {
    create: (...args: unknown[]) => createSessionMock(...args),
  },
}))

vi.mock('@/entities/project', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({ activeProject: { id: 'p1', name: 'Proj' } }),
}))

describe('SessionIntentDialogContainer', () => {
  beforeEach(() => {
    beginSessionDraftMock.mockReset()
    setActiveSessionMock.mockReset()
    createSessionMock.mockReset()
    createSessionMock.mockResolvedValue({
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

    expect(screen.getByTestId('session-intent-conversation')).toBeInTheDocument()
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

  it('picking Terminal creates a shell session in the payload workspace and closes the dialog', async () => {
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
    await waitFor(() => {
      expect(close).toHaveBeenCalled()
    })
  })

  it('picking Terminal at project root passes null workspaceId', async () => {
    useDialogStore.setState({
      openDialog: 'session-intent',
      payload: { workspaceId: null },
      open: vi.fn(),
      close: vi.fn(),
    })

    render(<SessionIntentDialogContainer />)

    fireEvent.click(screen.getByTestId('session-intent-terminal'))

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: null }),
      )
    })
  })
})
