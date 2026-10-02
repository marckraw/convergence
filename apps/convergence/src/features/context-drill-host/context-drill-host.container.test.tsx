import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notify } from '@convergence/ui'
import {
  useContextDrillStore,
  type DrillOutcome,
} from '@/entities/context-drill'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { ContextDrillHostContainer } from './context-drill-host.container'

vi.mock('@convergence/ui', () => ({
  notify: { success: vi.fn(), message: vi.fn(), error: vi.fn() },
}))

const toastMock = vi.mocked(notify)

function session(id: string, usedPercentage: number): SessionSummary {
  return {
    id,
    name: `Session ${id}`,
    contextWindow: {
      availability: 'available',
      source: 'provider',
      usedTokens: usedPercentage * 2000,
      windowTokens: 200000,
      usedPercentage,
      remainingPercentage: 100 - usedPercentage,
    },
  } as SessionSummary
}

// Far from the store's own counter, so an ending this test lands and one the
// store records (an automatic run) never share a seq by accident.
let seq = 1000

/** Records an ending the way the store's `run` does. */
function land(sessionId: string, outcome: DrillOutcome, before: number | null) {
  act(() => {
    useContextDrillStore.setState((state) => ({
      outcomes: {
        ...state.outcomes,
        [sessionId]: { seq: ++seq, outcome, before },
      },
    }))
  })
}

describe('ContextDrillHostContainer (MAR-3256 R4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useContextDrillStore.setState({
      descriptions: {},
      beats: {},
      outcomes: {},
      cancelRequested: {},
      unsubscribe: null,
    })
    useSessionStore.setState({ globalSessions: [session('a', 9)] })
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      contextDrill: {
        run: vi.fn(),
        cancel: vi.fn(),
        describe: vi.fn(),
        onChanged: vi.fn(() => () => {}),
      },
    }
  })

  it('renders nothing', () => {
    const { container } = render(<ContextDrillHostContainer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps an automatic failure on screen with Run the drill, never a button failure (CONV-7)', () => {
    const { container } = render(<ContextDrillHostContainer />)
    const outcome = {
      ok: false as const,
      beat: 'sealing' as const,
      reason: 'No seal.',
    }
    land('a', outcome, 90)
    // A failure of a run somebody pressed for: an ordinary toast that leaves.
    expect(toastMock.error).toHaveBeenLastCalledWith(
      'The drill stopped while sealing',
      { id: 'context-drill:a', description: 'No seal.' },
    )
    act(() =>
      useContextDrillStore.getState().handleChange({
        sessionId: 'a',
        beat: null,
        automatic: { outcome, before: 90 },
      }),
    )
    // Mutation: drop `persistent` -> the toast leaves after a few seconds, red.
    expect(toastMock.error).toHaveBeenLastCalledWith(
      'The drill stopped while sealing',
      expect.objectContaining({
        id: 'context-drill:a',
        description: 'No seal.',
        persistent: true,
        action: expect.objectContaining({ label: 'Run the drill' }),
      }),
    )
    // No card of its own in the toasts' corner any more.
    expect(container).toBeEmptyDOMElement()
    const run = vi
      .spyOn(useContextDrillStore.getState(), 'run')
      .mockResolvedValue()
    toastMock.error.mock.calls.at(-1)?.[1]?.action?.onClick()
    expect(run).toHaveBeenCalledWith('a')
    run.mockRestore()
  })

  it('offers Open beside Run the drill when the app hands down a focus path', () => {
    const onFocusSession = vi.fn()
    render(<ContextDrillHostContainer onFocusSession={onFocusSession} />)
    act(() =>
      useContextDrillStore.getState().handleChange({
        sessionId: 'a',
        beat: null,
        automatic: {
          outcome: { ok: false, beat: 'compacting', reason: 'Timed out.' },
          before: 90,
        },
      }),
    )
    const options = toastMock.error.mock.calls.at(-1)?.[1]
    expect(options?.secondaryAction?.label).toBe('Open')
    options?.secondaryAction?.onClick()
    expect(onFocusSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
    )
  })

  it('tells the crossing when the drill finishes', () => {
    render(<ContextDrillHostContainer />)

    land('a', { ok: true }, 76)

    expect(toastMock.success).toHaveBeenCalledTimes(1)
    expect(toastMock.success.mock.calls[0]![0]).toBe('The drill finished')
    expect(toastMock.success.mock.calls[0]![1]).toMatchObject({
      description: 'Context compacted: 76 % → 9 %',
    })
  })

  it('does not tell the same ending twice', () => {
    const { rerender } = render(<ContextDrillHostContainer />)

    land('a', { ok: true }, 76)
    rerender(<ContextDrillHostContainer />)
    rerender(<ContextDrillHostContainer />)

    expect(toastMock.success).toHaveBeenCalledTimes(1)
  })

  it('says nothing about an ending that was already in the store at mount', () => {
    useContextDrillStore.setState({
      outcomes: { a: { seq: 999, outcome: { ok: true }, before: 76 } },
    })

    render(<ContextDrillHostContainer />)

    expect(toastMock.success).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(toastMock.message).not.toHaveBeenCalled()
  })

  it('names the beat that stopped when the drill fails', () => {
    render(<ContextDrillHostContainer />)

    land(
      'a',
      { ok: false, beat: 'sealing', reason: 'The agent did not confirm.' },
      76,
    )

    expect(toastMock.error).toHaveBeenCalledTimes(1)
    expect(toastMock.error.mock.calls[0]![0]).toBe(
      'The drill stopped while sealing',
    )
    expect(toastMock.error.mock.calls[0]![1]).toMatchObject({
      description: 'The agent did not confirm.',
    })
  })

  it('tells a cancelled run neutrally, not as an error', () => {
    render(<ContextDrillHostContainer />)
    act(() => {
      useContextDrillStore.setState({ cancelRequested: { a: true } })
    })

    land(
      'a',
      { ok: false, beat: 'sealing', reason: 'The drill was cancelled.' },
      76,
    )

    expect(toastMock.error).not.toHaveBeenCalled()
    expect(toastMock.message).toHaveBeenCalledTimes(1)
    expect(toastMock.message.mock.calls[0]![0]).toBe('The drill was cancelled')
    expect(useContextDrillStore.getState().cancelRequested.a).toBeUndefined()
  })

  it('offers an Open action that focuses the conversation', () => {
    const onFocusSession = vi.fn()
    render(<ContextDrillHostContainer onFocusSession={onFocusSession} />)

    land('a', { ok: true }, 76)

    const options = toastMock.success.mock.calls[0]![1]
    expect(options?.action?.label).toBe('Open')
    options?.action?.onClick()
    expect(onFocusSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
    )
  })

  it('omits the action when the app hands down no focus path', () => {
    render(<ContextDrillHostContainer />)

    land('a', { ok: true }, 76)

    expect(toastMock.success.mock.calls[0]![1]).not.toHaveProperty('action')
  })

  it('falls back to the plain sentence when no figure was measured', () => {
    useSessionStore.setState({ globalSessions: [] })
    render(<ContextDrillHostContainer />)

    land('a', { ok: true }, 76)

    expect(toastMock.success.mock.calls[0]![1]).toMatchObject({
      description: 'Context compacted.',
    })
  })

  it('installs exactly one change subscription', () => {
    const onChanged = (
      window as unknown as {
        electronAPI: { contextDrill: { onChanged: ReturnType<typeof vi.fn> } }
      }
    ).electronAPI.contextDrill.onChanged
    const { rerender } = render(<ContextDrillHostContainer />)

    rerender(<ContextDrillHostContainer />)

    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})
