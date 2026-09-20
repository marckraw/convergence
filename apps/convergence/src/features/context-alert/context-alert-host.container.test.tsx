import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useAppSettingsStore } from '@/entities/app-settings'
import { contextDrillApi, useContextDrillStore } from '@/entities/context-drill'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import type { ContextAlertSettings } from '@/shared/lib/context-alert-settings.pure'
import { ContextAlertHostContainer } from './context-alert-host.container'

vi.mock('sonner', () => ({ toast: vi.fn() }))

vi.mock('@/entities/context-drill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/context-drill')>()),
  contextDrillApi: {
    run: vi.fn(),
    cancel: vi.fn(),
    describe: vi.fn(),
    onChanged: vi.fn(),
  },
}))

const describeDrill = vi.mocked(contextDrillApi.describe)

const toastMock = toast as unknown as ReturnType<typeof vi.fn>

function session(
  id: string,
  usedPercentage: number,
  status: SessionSummary['status'] = 'completed',
): SessionSummary {
  const windowTokens = 200000
  return {
    id,
    name: `Session ${id}`,
    status,
    contextWindow: {
      availability: 'available',
      source: 'provider',
      usedTokens: Math.round((usedPercentage / 100) * windowTokens),
      windowTokens,
      usedPercentage,
      remainingPercentage: 100 - usedPercentage,
    },
  } as SessionSummary
}

function setAlert(alert: ContextAlertSettings) {
  useAppSettingsStore.setState((state) => ({
    settings: { ...state.settings, contextAlert: alert },
  }))
}

function setSessions(sessions: SessionSummary[]) {
  useSessionStore.setState({ globalSessions: sessions })
}

/**
 * A turn of conversation `id` that ends at `usedPercentage`. Nothing is told
 * about a conversation that was never seen working, so this is the shape every
 * telling case needs.
 */
async function runATurn(id: string, usedPercentage: number) {
  act(() => setSessions([session(id, usedPercentage, 'running')]))
  act(() => setSessions([session(id, usedPercentage, 'completed')]))
  await flush()
}

/**
 * Drains the telling.
 *
 * The toast now waits on `describe` before it is raised (MAR-3256 R5), so an
 * assertion taken in the same tick as the crossing would read the moment
 * before the toast rather than the toast.
 */
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('ContextAlertHostContainer', () => {
  beforeEach(() => {
    toastMock.mockClear()
    describeDrill.mockReset()
    // The app's ordinary conversation: eligible for nothing, so the toast is
    // exactly the one that shipped before this ticket.
    describeDrill.mockResolvedValue({
      eligible: false,
      offered: false,
      reason: "The drill only runs on a crew's mastermind conversation.",
      beat: null,
    })
    setAlert({ enabled: true, percent: 75, tokens: 400000 })
    setSessions([])
  })

  it('renders nothing', async () => {
    const { container } = render(<ContextAlertHostContainer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('tells once when a turn ends over the threshold', async () => {
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)
    expect(toastMock).not.toHaveBeenCalled()

    await runATurn('a', 80)

    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock.mock.calls[0]![0]).toBe('Context at 80 % — Session a')
    expect(toastMock.mock.calls[0]![1]).toMatchObject({
      description: 'over your 75 % alert · time to seal and compact',
    })
  })

  it('does not tell twice for the same crossing', async () => {
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)

    await runATurn('a', 80)
    await runATurn('a', 82)

    expect(toastMock).toHaveBeenCalledTimes(1)
  })

  it('does not tell on the first render with an over-threshold session', async () => {
    setSessions([session('a', 90)])
    render(<ContextAlertHostContainer />)
    await flush()

    expect(toastMock).not.toHaveBeenCalled()
  })

  it('does not storm when the first list arrives after an empty one', async () => {
    // The app's real order: the store is empty at mount and the conversations
    // land a tick later, already over the line. None of them ended a turn in
    // front of us, so none of them is told.
    render(<ContextAlertHostContainer />)
    await flush()
    expect(toastMock).not.toHaveBeenCalled()

    act(() => setSessions([session('a', 90), session('b', 95)]))
    await flush()

    expect(toastMock).not.toHaveBeenCalled()
  })

  it('stays quiet when the threshold is lowered onto idle conversations', async () => {
    // Two conversations that worked under our watch and then went quiet, well
    // under the line. This is QA step 2: lowering the threshold colours their
    // dots and says nothing.
    setSessions([session('a', 30), session('b', 40)])
    render(<ContextAlertHostContainer />)
    act(() => setSessions([session('a', 30, 'running'), session('b', 40)]))
    act(() => setSessions([session('a', 30), session('b', 40, 'running')]))
    act(() => setSessions([session('a', 30), session('b', 40)]))
    await flush()
    expect(toastMock).not.toHaveBeenCalled()

    act(() => setAlert({ enabled: true, percent: 5, tokens: 400000 }))
    await flush()

    expect(toastMock).not.toHaveBeenCalled()

    // And the next turn that ends above the new line is told about.
    await runATurn('a', 30)
    expect(toastMock).toHaveBeenCalledTimes(1)
  })

  it('names the token cap when the cap was the limit reached first', async () => {
    const big = (
      usedTokens: number,
      status: SessionSummary['status'] = 'completed',
    ) =>
      ({
        id: 'big',
        name: 'Big window',
        status,
        contextWindow: {
          availability: 'available',
          source: 'provider',
          usedTokens,
          windowTokens: 1000000,
          usedPercentage: Math.round((usedTokens / 1000000) * 100),
          remainingPercentage: 100 - Math.round((usedTokens / 1000000) * 100),
        },
      }) as SessionSummary

    setSessions([big(100000)])
    render(<ContextAlertHostContainer />)

    act(() => setSessions([big(410000, 'running')]))
    act(() => setSessions([big(410000)]))
    await flush()

    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock.mock.calls[0]![0]).toBe('Context at 41 % — Big window')
    expect(toastMock.mock.calls[0]![1]).toMatchObject({
      description: 'over your 400k-token alert · time to seal and compact',
    })
  })

  it('waits for the turn boundary before telling', async () => {
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)

    act(() => setSessions([session('a', 80, 'running')]))
    await flush()
    expect(toastMock).not.toHaveBeenCalled()

    act(() => setSessions([session('a', 80, 'completed')]))
    await flush()
    expect(toastMock).toHaveBeenCalledTimes(1)
  })

  it('tells again after a compaction drops the figure and it climbs back', async () => {
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)

    await runATurn('a', 80)
    expect(toastMock).toHaveBeenCalledTimes(1)

    act(() => setSessions([session('a', 15)]))
    act(() => setSessions([session('a', 80)]))
    await flush()

    expect(toastMock).toHaveBeenCalledTimes(2)
  })

  it('tells nobody while the alert is switched off', async () => {
    setAlert({ enabled: false, percent: 75, tokens: 400000 })
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)

    await runATurn('a', 90)

    expect(toastMock).not.toHaveBeenCalled()
  })

  it('offers an Open action that focuses the session', async () => {
    const onFocusSession = vi.fn()
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer onFocusSession={onFocusSession} />)

    await runATurn('a', 80)

    const options = toastMock.mock.calls[0]![1] as {
      action: { label: string; onClick: () => void }
    }
    expect(options.action.label).toBe('Open')
    options.action.onClick()
    expect(onFocusSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
    )
  })

  it('omits the action when the app hands down no focus path', async () => {
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)

    await runATurn('a', 80)

    expect(toastMock.mock.calls[0]![1]).not.toHaveProperty('action')
  })

  describe('the drill, offered beside the alert (MAR-3256 R5)', () => {
    function offerTheDrill() {
      describeDrill.mockResolvedValue({
        eligible: true,
        offered: true,
        reason: null,
        beat: null,
      })
    }

    it('offers Run the drill when the backend says it is available', async () => {
      offerTheDrill()
      const run = vi
        .spyOn(useContextDrillStore.getState(), 'run')
        .mockResolvedValue(undefined)
      setSessions([session('a', 20)])
      render(<ContextAlertHostContainer />)

      await runATurn('a', 80)

      expect(describeDrill).toHaveBeenCalledWith('a')
      const options = toastMock.mock.calls[0]![1] as {
        cancel: { label: string; onClick: () => void }
      }
      expect(options.cancel.label).toBe('Run the drill')
      options.cancel.onClick()
      expect(run).toHaveBeenCalledWith('a')
      run.mockRestore()
    })

    it('raises today’s toast, byte for byte, on a conversation it is not offered for', async () => {
      setSessions([session('a', 20)])
      render(<ContextAlertHostContainer />)

      await runATurn('a', 80)

      expect(toastMock).toHaveBeenCalledTimes(1)
      expect(toastMock.mock.calls[0]![0]).toBe('Context at 80 % — Session a')
      expect(toastMock.mock.calls[0]![1]).toEqual({
        description: 'over your 75 % alert · time to seal and compact',
      })
    })

    it('raises today’s toast when describe rejects', async () => {
      describeDrill.mockRejectedValue(new Error('main is busy'))
      setSessions([session('a', 20)])
      render(<ContextAlertHostContainer />)

      await runATurn('a', 80)

      expect(toastMock).toHaveBeenCalledTimes(1)
      expect(toastMock.mock.calls[0]![1]).toEqual({
        description: 'over your 75 % alert · time to seal and compact',
      })
    })

    /**
     * The telling now waits on `describe`, and the store does not stop
     * updating while it waits. The crossing map is committed before the
     * await, so the pass that runs inside the window finds the crossing
     * already told and adds nothing.
     */
    it('still tells once when the store updates twice during the await', async () => {
      let answer: (value: {
        eligible: boolean
        offered: boolean
        reason: string | null
        beat: null
      }) => void = () => {}
      describeDrill.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve
        }),
      )
      setSessions([session('a', 20)])
      render(<ContextAlertHostContainer />)

      act(() => setSessions([session('a', 80, 'running')]))
      act(() => setSessions([session('a', 80, 'completed')]))
      // Two more store updates land while `describe` has not answered yet.
      act(() => setSessions([session('a', 81, 'completed')]))
      act(() => setSessions([session('a', 82, 'completed')]))
      expect(toastMock).not.toHaveBeenCalled()

      act(() =>
        answer({ eligible: false, offered: false, reason: null, beat: null }),
      )
      await flush()

      expect(toastMock).toHaveBeenCalledTimes(1)
    })
  })
})
