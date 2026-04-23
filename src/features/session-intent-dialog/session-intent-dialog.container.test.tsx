import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDialogStore } from '@/entities/dialog'
import { SessionIntentDialogContainer } from './session-intent-dialog.container'

const beginSessionDraftMock = vi.fn()

vi.mock('@/entities/session', () => ({
  useSessionStore: (
    selector: (state: { beginSessionDraft: typeof beginSessionDraftMock }) => unknown,
  ) => selector({ beginSessionDraft: beginSessionDraftMock }),
}))

describe('SessionIntentDialogContainer', () => {
  beforeEach(() => {
    beginSessionDraftMock.mockReset()
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

  it('picking Terminal opens the terminal-session-create dialog with the payload workspace', () => {
    const open = vi.fn()
    useDialogStore.setState({
      openDialog: 'session-intent',
      payload: { workspaceId: 'ws-1' },
      open,
      close: vi.fn(),
    })

    render(<SessionIntentDialogContainer />)

    fireEvent.click(screen.getByTestId('session-intent-terminal'))

    expect(open).toHaveBeenCalledWith('terminal-session-create', {
      workspaceId: 'ws-1',
    })
  })
})
