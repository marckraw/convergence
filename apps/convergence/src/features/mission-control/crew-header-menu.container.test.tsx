import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionCrewStore } from '@/entities/session-crew'
import type { SessionCrew } from '@/entities/session-crew'
import { CrewHeaderMenu } from './crew-header-menu.container'

function makeCrew(overrides: Partial<SessionCrew> = {}): SessionCrew {
  return {
    id: 'crew-1',
    name: 'Night shift',
    emoji: '🌙',
    accentColor: '#7c3aed',
    position: 0,
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    sessionIds: ['s1', 's2'],
    ...overrides,
  }
}

function installCrewApi() {
  const api = {
    list: vi.fn(async () => []),
    create: vi.fn(),
    update: vi.fn(async (id: string, patch: Partial<SessionCrew>) => ({
      ...makeCrew(),
      ...patch,
      id,
    })),
    delete: vi.fn(async () => undefined),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    onUpdated: vi.fn(() => () => undefined),
  }
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { crew: api }
  return api
}

async function openMenu(crewName = 'Night shift') {
  fireEvent.click(await screen.findByLabelText(`Edit crew ${crewName}`))
}

describe('CrewHeaderMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionCrewStore.getState().unsubscribeBroadcast?.()
    useSessionCrewStore.setState({
      crews: [makeCrew()],
      isLoaded: true,
      error: null,
      unsubscribeBroadcast: null,
    })
  })

  it('renames a crew', async () => {
    const api = installCrewApi()
    render(<CrewHeaderMenu crew={makeCrew()} />)
    await openMenu()

    const name = await screen.findByLabelText('Crew name')
    expect(name).toHaveValue('Night shift')
    fireEvent.change(name, { target: { value: 'Owls' } })
    fireEvent.click(screen.getByText('Save name'))

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('crew-1', { name: 'Owls' }),
    )
  })

  it('renames on Enter', async () => {
    const api = installCrewApi()
    render(<CrewHeaderMenu crew={makeCrew()} />)
    await openMenu()

    const name = await screen.findByLabelText('Crew name')
    fireEvent.change(name, { target: { value: 'Owls' } })
    fireEvent.keyDown(name, { key: 'Enter' })

    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
  })

  it('will not save a blank or unchanged name', async () => {
    const api = installCrewApi()
    render(<CrewHeaderMenu crew={makeCrew()} />)
    await openMenu()

    // Unchanged.
    expect(await screen.findByText('Save name')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Crew name'), {
      target: { value: '   ' },
    })
    expect(screen.getByText('Save name')).toBeDisabled()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('changes decoration immediately, one field at a time', async () => {
    const api = installCrewApi()
    render(<CrewHeaderMenu crew={makeCrew()} />)
    await openMenu()

    fireEvent.click(await screen.findByLabelText('Emoji 🐎'))
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('crew-1', { emoji: '🐎' }),
    )

    fireEvent.click(screen.getByLabelText('Green'))
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('crew-1', {
        accentColor: '#10b981',
      }),
    )
  })

  it('clears a decoration by picking the active choice again', async () => {
    const api = installCrewApi()
    render(<CrewHeaderMenu crew={makeCrew()} />)
    await openMenu()

    fireEvent.click(await screen.findByLabelText('Emoji 🌙'))

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('crew-1', { emoji: null }),
    )
  })

  it('asks before deleting, and says the sessions survive', async () => {
    const api = installCrewApi()
    render(<CrewHeaderMenu crew={makeCrew()} />)
    await openMenu()

    fireEvent.click(await screen.findByText('Delete crew'))

    expect(screen.getByText(/stay exactly where they are/)).toBeInTheDocument()
    expect(screen.getByText(/2 sessions/)).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('deletes once confirmed', async () => {
    const api = installCrewApi()
    render(<CrewHeaderMenu crew={makeCrew()} />)
    await openMenu()

    fireEvent.click(await screen.findByText('Delete crew'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete crew' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('crew-1'))
  })

  it('backs out of the confirm without deleting', async () => {
    const api = installCrewApi()
    render(<CrewHeaderMenu crew={makeCrew()} />)
    await openMenu()

    fireEvent.click(await screen.findByText('Delete crew'))
    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() =>
      expect(
        screen.queryByText(/stay exactly where they are/),
      ).not.toBeInTheDocument(),
    )
    expect(api.delete).not.toHaveBeenCalled()
  })
})
