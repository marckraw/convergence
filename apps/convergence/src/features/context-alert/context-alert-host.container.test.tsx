import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import type { ContextAlertSettings } from '@/shared/lib/context-alert-settings.pure'
import { ContextAlertHostContainer } from './context-alert-host.container'

vi.mock('sonner', () => ({ toast: vi.fn() }))

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
function runATurn(id: string, usedPercentage: number) {
  act(() => setSessions([session(id, usedPercentage, 'running')]))
  act(() => setSessions([session(id, usedPercentage, 'completed')]))
}

describe('ContextAlertHostContainer', () => {
  beforeEach(() => {
    toastMock.mockClear()
    setAlert({ enabled: true, percent: 75, tokens: 400000 })
    setSessions([])
  })

  it('renders nothing', () => {
    const { container } = render(<ContextAlertHostContainer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('tells once when a turn ends over the threshold', () => {
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)
    expect(toastMock).not.toHaveBeenCalled()

    runATurn('a', 80)

    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock.mock.calls[0]![0]).toBe('Context at 80 % — Session a')
    expect(toastMock.mock.calls[0]![1]).toMatchObject({
      description: 'over your 75 % alert · time to seal and compact',
    })
  })

  it('does not tell twice for the same crossing', () => {
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)

    runATurn('a', 80)
    runATurn('a', 82)

    expect(toastMock).toHaveBeenCalledTimes(1)
  })

  it('does not tell on the first render with an over-threshold session', () => {
    setSessions([session('a', 90)])
    render(<ContextAlertHostContainer />)

    expect(toastMock).not.toHaveBeenCalled()
  })

  it('does not storm when the first list arrives after an empty one', () => {
    // The app's real order: the store is empty at mount and the conversations
    // land a tick later, already over the line. None of them ended a turn in
    // front of us, so none of them is told.
    render(<ContextAlertHostContainer />)
    expect(toastMock).not.toHaveBeenCalled()

    act(() => setSessions([session('a', 90), session('b', 95)]))

    expect(toastMock).not.toHaveBeenCalled()
  })

  it('stays quiet when the threshold is lowered onto idle conversations', () => {
    // Two conversations that worked under our watch and then went quiet, well
    // under the line. This is QA step 2: lowering the threshold colours their
    // dots and says nothing.
    setSessions([session('a', 30), session('b', 40)])
    render(<ContextAlertHostContainer />)
    act(() => setSessions([session('a', 30, 'running'), session('b', 40)]))
    act(() => setSessions([session('a', 30), session('b', 40, 'running')]))
    act(() => setSessions([session('a', 30), session('b', 40)]))
    expect(toastMock).not.toHaveBeenCalled()

    act(() => setAlert({ enabled: true, percent: 5, tokens: 400000 }))

    expect(toastMock).not.toHaveBeenCalled()

    // And the next turn that ends above the new line is told about.
    runATurn('a', 30)
    expect(toastMock).toHaveBeenCalledTimes(1)
  })

  it('names the token cap when the cap was the limit reached first', () => {
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

    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock.mock.calls[0]![0]).toBe('Context at 41 % — Big window')
    expect(toastMock.mock.calls[0]![1]).toMatchObject({
      description: 'over your 400k-token alert · time to seal and compact',
    })
  })

  it('waits for the turn boundary before telling', () => {
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)

    act(() => setSessions([session('a', 80, 'running')]))
    expect(toastMock).not.toHaveBeenCalled()

    act(() => setSessions([session('a', 80, 'completed')]))
    expect(toastMock).toHaveBeenCalledTimes(1)
  })

  it('tells again after a compaction drops the figure and it climbs back', () => {
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)

    runATurn('a', 80)
    expect(toastMock).toHaveBeenCalledTimes(1)

    act(() => setSessions([session('a', 15)]))
    act(() => setSessions([session('a', 80)]))

    expect(toastMock).toHaveBeenCalledTimes(2)
  })

  it('tells nobody while the alert is switched off', () => {
    setAlert({ enabled: false, percent: 75, tokens: 400000 })
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)

    runATurn('a', 90)

    expect(toastMock).not.toHaveBeenCalled()
  })

  it('offers an Open action that focuses the session', () => {
    const onFocusSession = vi.fn()
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer onFocusSession={onFocusSession} />)

    runATurn('a', 80)

    const options = toastMock.mock.calls[0]![1] as {
      action: { label: string; onClick: () => void }
    }
    expect(options.action.label).toBe('Open')
    options.action.onClick()
    expect(onFocusSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
    )
  })

  it('omits the action when the app hands down no focus path', () => {
    setSessions([session('a', 20)])
    render(<ContextAlertHostContainer />)

    runATurn('a', 80)

    expect(toastMock.mock.calls[0]![1]).not.toHaveProperty('action')
  })
})
