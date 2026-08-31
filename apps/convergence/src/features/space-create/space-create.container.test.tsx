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
  })
})
