import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useDialogStore } from '@/entities/dialog'
import { useSpaceStore } from '@/entities/space'
import type { Space } from '@/entities/space'
import { SpaceCreateDialogContainer } from './space-create.container'

const createdSpace: Space = {
  id: 'space-1',
  title: 'Launch plan',
  status: 'exploring',
  attention: 'none',
  brief: 'Coordinate launch work.',
  memory: '',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const mockElectronAPI = {
  space: {
    create: vi.fn(),
    linkAttempt: vi.fn(),
    listAttempts: vi.fn(),
    listAttemptsForSession: vi.fn(),
  },
}

describe('SpaceCreateDialogContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    })
    mockElectronAPI.space.create.mockResolvedValue(createdSpace)
    mockElectronAPI.space.linkAttempt.mockResolvedValue({
      id: 'attempt-1',
      spaceId: 'space-1',
      sessionId: 'session-1',
      role: 'seed',
      isPrimary: true,
    })
    mockElectronAPI.space.listAttempts.mockResolvedValue([])
    mockElectronAPI.space.listAttemptsForSession.mockResolvedValue([])
    useDialogStore.setState({ openDialog: 'space-create', payload: null })
    useSpaceStore.setState({
      spaces: [],
      attemptsBySpaceId: {},
      attemptsBySessionId: {},
      artifactsBySpaceId: {},
      sourcesBySpaceId: {},
      loading: false,
      error: null,
    })
  })

  it('creates a Space with title and initial brief', async () => {
    const onCreated = vi.fn()

    render(<SpaceCreateDialogContainer onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Launch plan' },
    })
    fireEvent.change(screen.getByLabelText('Initial brief'), {
      target: { value: 'Coordinate launch work.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create space/i }))

    await waitFor(() => {
      expect(mockElectronAPI.space.create).toHaveBeenCalledWith({
        title: 'Launch plan',
        brief: 'Coordinate launch work.',
      })
      expect(onCreated).toHaveBeenCalledWith(createdSpace)
    })
    expect(useDialogStore.getState().openDialog).toBeNull()
  })

  // Ruling 4: one way to create a Space. A trigger inside another dialog opens
  // this one prefilled, and it hands back to where it was opened from.
  it('hands back to the Spaces board with the new Space chosen', async () => {
    const onCreated = vi.fn()
    useDialogStore.setState({
      openDialog: 'space-create',
      payload: { newSpace: { returnTo: 'space-workboard' } },
    })
    render(<SpaceCreateDialogContainer onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Launch plan' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Space' }))

    await waitFor(() =>
      expect(useDialogStore.getState()).toMatchObject({
        openDialog: 'space-workboard',
        payload: { spaceId: 'space-1' },
      }),
    )
    // The board shows it; the sidebar's own hand-off is not this one's.
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('goes back to the Spaces board unchanged when cancelled from there', () => {
    useDialogStore.setState({
      openDialog: 'space-create',
      payload: { newSpace: { returnTo: 'space-workboard' } },
    })
    render(<SpaceCreateDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(useDialogStore.getState()).toMatchObject({
      openDialog: 'space-workboard',
      payload: null,
    })
    expect(mockElectronAPI.space.create).not.toHaveBeenCalled()
  })

  it('starts from a session, makes it the seed attempt, and goes back to Session Space', async () => {
    useDialogStore.setState({
      openDialog: 'space-create',
      payload: {
        newSpace: {
          title: 'Refactor auth',
          seedSessionId: 'session-1',
          returnTo: 'space-session-link',
        },
      },
    })
    render(<SpaceCreateDialogContainer />)

    expect(screen.getByLabelText('Title')).toHaveValue('Refactor auth')
    expect(
      screen.getByText(
        'Create a durable chat context, with this session as its seed attempt.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Space' }))

    await waitFor(() =>
      expect(mockElectronAPI.space.linkAttempt).toHaveBeenCalledWith({
        spaceId: 'space-1',
        sessionId: 'session-1',
        role: 'seed',
        isPrimary: true,
      }),
    )
    expect(mockElectronAPI.space.create).toHaveBeenCalledWith({
      title: 'Refactor auth',
      brief: '',
    })
    expect(useDialogStore.getState()).toMatchObject({
      openDialog: 'space-session-link',
      payload: { sessionId: 'session-1' },
    })
  })
})
