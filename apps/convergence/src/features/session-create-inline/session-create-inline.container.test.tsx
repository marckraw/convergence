import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDialogStore } from '@/entities/dialog'
import { SessionCreateInline } from './session-create-inline.container'

describe('SessionCreateInline', () => {
  const open = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useDialogStore.setState({
      openDialog: null,
      payload: null,
      open,
      close: vi.fn(),
    })
  })

  it('opens the session intent dialog with the chosen workspace id', () => {
    render(<SessionCreateInline workspaceId="workspace-1" />)

    fireEvent.click(screen.getByRole('button', { name: /new session/i }))

    expect(open).toHaveBeenCalledWith('session-intent', {
      workspaceId: 'workspace-1',
    })
  })
})
