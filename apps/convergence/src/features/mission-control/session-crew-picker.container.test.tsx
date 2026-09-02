import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionCrewStore } from '@/entities/session-crew'
import type { SessionCrew } from '@/entities/session-crew'
import { SessionCrewPicker } from './session-crew-picker.container'

function makeCrew(
  overrides: Partial<SessionCrew> & { id: string },
): SessionCrew {
  return {
    name: overrides.id,
    emoji: null,
    accentColor: null,
    position: 0,
    roundCap: null,
    stallMinutes: null,
    members: [],
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    sessionIds: [],
    ...overrides,
  }
}

/**
 * A stand-in for the crew backend that behaves like the real one: mutations
 * answer with the updated crew, which is what keeps the menu honest as it is
 * clicked.
 */
function installCrewBackend(initial: SessionCrew[] = []) {
  const crews = initial.map((crew) => ({ ...crew }))
  let created = 0

  const find = (id: string) => {
    const crew = crews.find((entry) => entry.id === id)
    if (!crew) throw new Error(`Crew not found: ${id}`)
    return crew
  }

  const api = {
    list: vi.fn(async () => crews.map((crew) => ({ ...crew }))),
    create: vi.fn(
      async (input: {
        name: string
        emoji?: string | null
        accentColor?: string | null
        sessionIds?: string[]
      }) => {
        created += 1
        const crew = makeCrew({
          id: `crew-${created}`,
          name: input.name.trim(),
          emoji: input.emoji ?? null,
          accentColor: input.accentColor ?? null,
          position: crews.length,
          sessionIds: [...(input.sessionIds ?? [])],
        })
        crews.push(crew)
        return { ...crew }
      },
    ),
    update: vi.fn(),
    delete: vi.fn(),
    addMember: vi.fn(async (crewId: string, sessionId: string) => {
      const crew = find(crewId)
      if (!crew.sessionIds.includes(sessionId)) crew.sessionIds.push(sessionId)
      return { ...crew }
    }),
    removeMember: vi.fn(async (crewId: string, sessionId: string) => {
      const crew = find(crewId)
      crew.sessionIds = crew.sessionIds.filter((id) => id !== sessionId)
      return { ...crew }
    }),
    onUpdated: vi.fn(() => () => undefined),
  }

  ;(window as unknown as { electronAPI: unknown }).electronAPI = { crew: api }
  useSessionCrewStore.setState({
    crews: crews.map((crew) => ({ ...crew })),
    isLoaded: true,
    error: null,
    unsubscribeBroadcast: null,
  })

  return api
}

function renderPicker() {
  return render(
    <SessionCrewPicker sessionId="session-1" sessionName="Wire the room" />,
  )
}

async function openPicker() {
  fireEvent.click(
    await screen.findByLabelText('Add Wire the room to a crew', {
      selector: 'button',
    }),
  )
}

describe('SessionCrewPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionCrewStore.getState().unsubscribeBroadcast?.()
    useSessionCrewStore.setState({
      crews: [],
      isLoaded: false,
      error: null,
      unsubscribeBroadcast: null,
    })
  })

  it('invites the first crew when none exist', async () => {
    installCrewBackend([])
    renderPicker()
    await openPicker()

    expect(
      await screen.findByText('No crews yet. Make the first one below.'),
    ).toBeInTheDocument()
    expect(screen.getByText('New crew')).toBeInTheDocument()
  })

  it('creates a decorated crew and puts the session in it', async () => {
    const api = installCrewBackend([])
    renderPicker()
    await openPicker()

    fireEvent.click(await screen.findByText('New crew'))
    fireEvent.change(screen.getByLabelText('New crew name'), {
      target: { value: '  Night shift  ' },
    })
    fireEvent.click(screen.getByLabelText('Emoji 🌙'))
    fireEvent.click(screen.getByLabelText('Violet'))
    fireEvent.click(screen.getByText('Create & add this session'))

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1))
    expect(api.create).toHaveBeenCalledWith({
      name: '  Night shift  ',
      emoji: '🌙',
      accentColor: '#7c3aed',
      sessionIds: ['session-1'],
    })

    // The new crew is in the list without a reload, and the card button now
    // names it.
    expect(
      await screen.findByRole('option', { name: /Night shift/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Add Wire the room to a crew', {
        selector: 'button',
      }),
    ).toHaveTextContent('Night shift')
  })

  it('will not create a crew with a blank name', async () => {
    const api = installCrewBackend([])
    renderPicker()
    await openPicker()

    fireEvent.click(await screen.findByText('New crew'))
    fireEvent.change(screen.getByLabelText('New crew name'), {
      target: { value: '   ' },
    })

    expect(screen.getByText('Create & add this session')).toBeDisabled()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('creates on Enter from the name field', async () => {
    const api = installCrewBackend([])
    renderPicker()
    await openPicker()

    fireEvent.click(await screen.findByText('New crew'))
    const name = screen.getByLabelText('New crew name')
    fireEvent.change(name, { target: { value: 'Reviewers' } })
    fireEvent.keyDown(name, { key: 'Enter' })

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1))
  })

  it('toggles membership on and back off', async () => {
    const api = installCrewBackend([
      makeCrew({ id: 'c1', name: 'Night shift' }),
    ])
    renderPicker()
    await openPicker()

    fireEvent.click(await screen.findByRole('option', { name: /Night shift/ }))
    await waitFor(() =>
      expect(api.addMember).toHaveBeenCalledWith('c1', 'session-1'),
    )

    fireEvent.click(screen.getByRole('option', { name: /Night shift/ }))
    await waitFor(() =>
      expect(api.removeMember).toHaveBeenCalledWith('c1', 'session-1'),
    )
  })

  it('adds to a second crew without leaving the first', async () => {
    const api = installCrewBackend([
      makeCrew({ id: 'c1', name: 'Masterminds', sessionIds: ['session-1'] }),
      makeCrew({ id: 'c2', name: 'Workers', position: 1 }),
    ])
    renderPicker()
    await openPicker()

    fireEvent.click(await screen.findByRole('option', { name: /Workers/ }))

    await waitFor(() =>
      expect(api.addMember).toHaveBeenCalledWith('c2', 'session-1'),
    )
    expect(api.removeMember).not.toHaveBeenCalled()
    // The menu stays open so several crews can be picked in one pass, and the
    // first crew keeps its tick.
    expect(
      screen.getByRole('option', { name: /Masterminds/ }),
    ).toBeInTheDocument()
    expect(useSessionCrewStore.getState().crews[0]?.sessionIds).toEqual([
      'session-1',
    ])
  })

  it('names the crew on the card button once the session belongs to one', async () => {
    installCrewBackend([
      makeCrew({ id: 'c1', name: 'Night shift', sessionIds: ['session-1'] }),
    ])
    renderPicker()

    expect(await screen.findByText('Night shift')).toBeInTheDocument()
  })

  it('counts crews on the card button when the session is in several', async () => {
    installCrewBackend([
      makeCrew({ id: 'c1', name: 'Masterminds', sessionIds: ['session-1'] }),
      makeCrew({ id: 'c2', name: 'Workers', sessionIds: ['session-1'] }),
    ])
    renderPicker()

    expect(await screen.findByText('2 crews')).toBeInTheDocument()
  })

  it('offers search only once the list is long enough to need it', async () => {
    installCrewBackend(
      Array.from({ length: 6 }, (_, index) =>
        makeCrew({ id: `c${index}`, name: `Crew ${index}`, position: index }),
      ),
    )
    renderPicker()
    await openPicker()

    const search = await screen.findByPlaceholderText('Search crews…')
    fireEvent.change(search, { target: { value: 'Crew 3' } })

    await waitFor(() =>
      expect(screen.queryByText('Crew 1')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Crew 3')).toBeInTheDocument()
  })
})
