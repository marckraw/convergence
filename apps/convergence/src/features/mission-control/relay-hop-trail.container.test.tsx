import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionRelayStore } from '@/entities/session-relay'
import type { RelayHop } from '@/entities/session-relay'
import { RelayHopTrail } from './relay-hop-trail.container'

const NAMES: Record<string, string> = {
  impl: 'Implementor',
  review: 'Reviewer',
}
const resolveName = (id: string): string | null => NAMES[id] ?? null

function hop(overrides: Partial<RelayHop> & { id: string }): RelayHop {
  return {
    relayId: 'r1',
    crewId: 'c1',
    flowRunId: 'run-1',
    firedAt: new Date().toISOString(),
    sourceSessionId: 'impl',
    targetSessionId: 'review',
    spawnedSessionId: null,
    triggerStatus: 'completed',
    payloadPreview: 'Done. Ready for review.',
    baton: null,
    roundNumber: null,
    outcome: 'delivered',
    error: null,
    ...overrides,
  }
}

let listHops: ReturnType<typeof vi.fn>
let clearHops: ReturnType<typeof vi.fn>
let hopListeners: Array<(hop: RelayHop) => void>

function renderTrail() {
  return render(<RelayHopTrail crewId="c1" resolveName={resolveName} />)
}

describe('RelayHopTrail', () => {
  beforeEach(() => {
    hopListeners = []
    listHops = vi.fn(async () => [])
    clearHops = vi.fn(async () => ({ removed: 0, kept: 0 }))
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      relay: {
        list: vi.fn(async () => []),
        listHops,
        clearHops,
        onUpdated: vi.fn(() => () => undefined),
        onHopAppended: vi.fn((cb: (hop: RelayHop) => void) => {
          hopListeners.push(cb)
          return () => undefined
        }),
        onHopsCleared: vi.fn(() => () => undefined),
      },
    }

    useSessionRelayStore.getState().unsubscribeBroadcast?.()
    useSessionRelayStore.getState().unsubscribeHops?.()
    useSessionRelayStore.getState().unsubscribeHopsCleared?.()
    useSessionRelayStore.setState({
      relays: [],
      hopsByCrewId: {},
      isLoaded: false,
      error: null,
      unsubscribeBroadcast: null,
      unsubscribeHops: null,
      unsubscribeHopsCleared: null,
    })
  })

  it('shows nothing at all until a wire has fired', async () => {
    const { container } = renderTrail()

    await waitFor(() => expect(listHops).toHaveBeenCalledWith('c1', 51, null))
    expect(container).toBeEmptyDOMElement()
  })

  it('counts the trail without opening it', async () => {
    listHops.mockResolvedValue([hop({ id: 'h1' }), hop({ id: 'h2' })])
    renderTrail()

    expect(await screen.findByText('2 hops')).toBeInTheDocument()
    // Closed by default: the room stays scannable.
    expect(screen.queryByText('delivered')).not.toBeInTheDocument()
  })

  it('reads each firing newest first when opened', async () => {
    listHops.mockResolvedValue([
      hop({ id: 'h2', outcome: 'queued' }),
      hop({ id: 'h1', outcome: 'delivered' }),
    ])
    renderTrail()

    fireEvent.click(await screen.findByRole('button', { name: /Trail/ }))

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('queued')
    expect(rows[0]).toHaveTextContent('Implementor')
    expect(rows[0]).toHaveTextContent('Reviewer')
    expect(rows[1]).toHaveTextContent('delivered')
  })

  it('shows the message carried only on demand', async () => {
    listHops.mockResolvedValue([hop({ id: 'h1' })])
    renderTrail()

    fireEvent.click(await screen.findByRole('button', { name: /Trail/ }))
    expect(
      screen.queryByText('Done. Ready for review.'),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Show the message carried' }),
    )
    expect(screen.getByText('Done. Ready for review.')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Hide the message carried' }),
    )
    expect(
      screen.queryByText('Done. Ready for review.'),
    ).not.toBeInTheDocument()
  })

  it('never hides an error behind a click', async () => {
    listHops.mockResolvedValue([
      hop({
        id: 'h1',
        outcome: 'error',
        error: 'The target session no longer exists.',
        payloadPreview: null,
      }),
    ])
    renderTrail()

    fireEvent.click(await screen.findByRole('button', { name: /Trail/ }))

    expect(
      screen.getByText('The target session no longer exists.'),
    ).toBeVisible()
    expect(screen.getByText('error')).toBeVisible()
  })

  it('says why a skip skipped', async () => {
    listHops.mockResolvedValue([
      hop({ id: 'h2', outcome: 'skipped-failed', payloadPreview: null }),
      hop({ id: 'h3', outcome: 'skipped-budget', payloadPreview: null }),
    ])
    renderTrail()

    fireEvent.click(await screen.findByRole('button', { name: /Trail/ }))

    expect(screen.getByText('skipped — source failed')).toBeInTheDocument()
    expect(screen.getByText('stopped — hop budget')).toBeInTheDocument()
  })

  it('shows a row written by another version without alarming anyone', async () => {
    listHops.mockResolvedValue([
      hop({ id: 'h1', outcome: 'skipped-disarmed', payloadPreview: null }),
    ])
    renderTrail()

    // The badge counts alarms; an unreadable row is not one.
    expect(screen.queryByText(/needs? your eyes/)).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /Trail/ }))

    const label = screen.getByText('unknown outcome')
    expect(label).toBeVisible()
    expect(label).toHaveAttribute(
      'title',
      'Recorded by another version as "skipped-disarmed"',
    )
  })

  it('badges errors and burnt budgets loudly, without being opened', async () => {
    listHops.mockResolvedValue([
      hop({ id: 'h1', outcome: 'delivered' }),
      hop({ id: 'h2', outcome: 'error', error: 'boom' }),
      hop({ id: 'h3', outcome: 'skipped-budget' }),
    ])
    renderTrail()

    expect(
      await screen.findByText('2 relay hops need your eyes'),
    ).toBeInTheDocument()
  })

  it('stays quiet when every hop is ordinary', async () => {
    listHops.mockResolvedValue([
      hop({ id: 'h1' }),
      hop({ id: 'h2', outcome: 'skipped-failed' }),
    ])
    renderTrail()

    await screen.findByText('2 hops')
    expect(screen.queryByText(/needs? your eyes/)).not.toBeInTheDocument()
  })

  describe('reaching further back', () => {
    function page(from: number, count: number): RelayHop[] {
      return Array.from({ length: count }, (_, index) =>
        hop({ id: `h${from + index}` }),
      )
    }

    it('offers nothing to load when the whole trail is on screen', async () => {
      listHops.mockResolvedValue(page(1, 3))
      renderTrail()

      fireEvent.click(await screen.findByRole('button', { name: /Trail/ }))
      expect(
        screen.queryByRole('button', { name: 'Load older' }),
      ).not.toBeInTheDocument()
    })

    it('reaches past the newest page when asked', async () => {
      listHops
        .mockResolvedValueOnce(page(1, 51))
        .mockResolvedValueOnce(page(51, 2))
      renderTrail()

      fireEvent.click(await screen.findByRole('button', { name: /Trail/ }))
      expect(screen.getAllByRole('listitem')).toHaveLength(50)

      fireEvent.click(screen.getByRole('button', { name: 'Load older' }))

      await waitFor(() => {
        expect(screen.getAllByRole('listitem')).toHaveLength(52)
      })
      expect(listHops).toHaveBeenLastCalledWith('c1', 51, 'h50')
      // Nothing behind that page, so the affordance goes rather than opening
      // onto an empty answer.
      expect(
        screen.queryByRole('button', { name: 'Load older' }),
      ).not.toBeInTheDocument()
    })
  })

  describe('clearing the trail', () => {
    it('asks before it wipes, and says what it is wiping', async () => {
      listHops.mockResolvedValue([hop({ id: 'h1' })])
      renderTrail()

      fireEvent.click(
        await screen.findByRole('button', { name: 'Clear trail' }),
      )

      expect(clearHops).not.toHaveBeenCalled()
      expect(
        screen.getByRole('button', {
          name: 'Clear every hop? The wires and sessions stay.',
        }),
      ).toBeVisible()
    })

    it('names the alerts a wipe takes with it', async () => {
      listHops.mockResolvedValue([
        hop({ id: 'h1', outcome: 'error', error: 'boom' }),
        hop({ id: 'h2', outcome: 'skipped-budget' }),
      ])
      renderTrail()

      fireEvent.click(
        await screen.findByRole('button', { name: 'Clear trail' }),
      )

      expect(
        screen.getByRole('button', {
          name: 'Clear every hop? The wires and sessions stay. This also dismisses 2 alerts.',
        }),
      ).toBeVisible()
    })

    it('empties the trail on the second press', async () => {
      listHops
        .mockResolvedValueOnce([hop({ id: 'h1' })])
        .mockResolvedValueOnce([])
      renderTrail()

      fireEvent.click(
        await screen.findByRole('button', { name: 'Clear trail' }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Clear every hop? The wires and sessions stay.',
        }),
      )

      await waitFor(() => expect(clearHops).toHaveBeenCalledWith('c1'))
      await waitFor(() => {
        expect(screen.queryByText('1 hop')).not.toBeInTheDocument()
      })
    })

    it('says out loud what a running flow kept', async () => {
      listHops
        .mockResolvedValueOnce([hop({ id: 'h1' }), hop({ id: 'h2' })])
        .mockResolvedValueOnce([hop({ id: 'h2' })])
      clearHops.mockResolvedValue({ removed: 1, kept: 1 })
      renderTrail()

      fireEvent.click(
        await screen.findByRole('button', { name: 'Clear trail' }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Clear every hop? The wires and sessions stay.',
        }),
      )

      expect(
        await screen.findByText(
          'Kept 1 hop from a flow that is still running.',
        ),
      ).toBeVisible()
      expect(screen.getByText('1 hop')).toBeInTheDocument()
    })

    it('keeps the note visible when the clear emptied the section', async () => {
      listHops
        .mockResolvedValueOnce([hop({ id: 'h1' })])
        .mockResolvedValueOnce([])
      clearHops.mockResolvedValue({ removed: 1, kept: 2 })
      renderTrail()

      fireEvent.click(
        await screen.findByRole('button', { name: 'Clear trail' }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Clear every hop? The wires and sessions stay.',
        }),
      )

      expect(
        await screen.findByText(
          'Kept 2 hops from a flow that is still running.',
        ),
      ).toBeVisible()
    })
  })

  it('grows live when the engine fires while the trail is open', async () => {
    listHops.mockResolvedValue([hop({ id: 'h1' })])
    renderTrail()
    await useSessionRelayStore.getState().load()

    fireEvent.click(await screen.findByRole('button', { name: /Trail/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)

    act(() => {
      hopListeners[0](hop({ id: 'h2', outcome: 'error', error: 'went wrong' }))
    })

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })
    expect(screen.getByText('went wrong')).toBeVisible()
    expect(screen.getByText('1 relay hop needs your eyes')).toBeInTheDocument()
  })
})
