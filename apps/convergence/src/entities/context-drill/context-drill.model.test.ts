import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { contextDrillApi } from './context-drill.api'
import { useContextDrillStore } from './context-drill.model'
import type { DrillDescription } from './context-drill.types'

vi.mock('./context-drill.api', () => ({
  contextDrillApi: {
    run: vi.fn(),
    cancel: vi.fn(),
    describe: vi.fn(),
    onChanged: vi.fn(),
  },
}))

const api = vi.mocked(contextDrillApi)

const READY: DrillDescription = {
  seat: 'mastermind',
  eligible: true,
  offered: true,
  reason: null,
  beat: null,
}

function session(id: string, usedPercentage: number): SessionSummary {
  return {
    id,
    name: id,
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

describe('useContextDrillStore (MAR-3256 R2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useContextDrillStore.setState({
      descriptions: {},
      beats: {},
      outcomes: {},
      cancelRequested: {},
      unsubscribe: null,
    })
    useSessionStore.setState({ globalSessions: [] })
  })

  it('refresh stores what the backend describes', async () => {
    api.describe.mockResolvedValue(READY)

    await useContextDrillStore.getState().refresh('s1')

    expect(api.describe).toHaveBeenCalledWith('s1')
    expect(useContextDrillStore.getState().descriptions.s1).toEqual(READY)
  })

  it('ignores the older refresh when it answers last', async () => {
    let older!: (answer: DrillDescription) => void
    api.describe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          older = resolve
        }),
    )
    const pending = useContextDrillStore.getState().refresh('s1')
    api.describe.mockResolvedValueOnce(READY)
    await useContextDrillStore.getState().refresh('s1')
    older({ ...READY, beat: 'sealing', offered: false })
    await pending
    expect(useContextDrillStore.getState().descriptions.s1).toEqual(READY)
    expect(useContextDrillStore.getState().beats.s1).toBeUndefined()
  })

  it('a changed ending invalidates an in-flight beat answer', async () => {
    let older!: (answer: DrillDescription) => void
    api.describe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          older = resolve
        }),
    )
    const pending = useContextDrillStore.getState().refresh('s1')
    api.describe.mockResolvedValueOnce(READY)
    useContextDrillStore
      .getState()
      .handleChange({ sessionId: 's1', beat: null })
    older({ ...READY, beat: 'sealing' })
    await pending
    expect(useContextDrillStore.getState().beats.s1).toBeUndefined()
  })

  it('refresh keeps the last description when describe rejects', async () => {
    api.describe.mockResolvedValueOnce(READY)
    await useContextDrillStore.getState().refresh('s1')
    api.describe.mockRejectedValueOnce(new Error('main is busy'))

    await useContextDrillStore.getState().refresh('s1')

    expect(useContextDrillStore.getState().descriptions.s1).toEqual(READY)
  })

  it('a refresh that finds a routine running shows its beat', async () => {
    // The window was closed and reopened while the routine was sealing: no
    // `changed` event will ever be delivered for a beat that started before
    // this renderer existed, and `describe` is the only place it is told.
    api.describe.mockResolvedValue({
      seat: 'mastermind',
      eligible: true,
      offered: false,
      reason: 'This conversation is still working on a turn.',
      beat: 'sealing',
    })

    await useContextDrillStore.getState().refresh('s1')

    expect(useContextDrillStore.getState().beats.s1).toBe('sealing')
  })

  it('a refresh with no beat leaves a running beat alone', async () => {
    api.describe.mockResolvedValue(READY)
    useContextDrillStore
      .getState()
      .handleChange({ sessionId: 's1', beat: 'sealing' })

    await useContextDrillStore.getState().refresh('s1')

    expect(useContextDrillStore.getState().beats.s1).toBe('sealing')
  })

  it('run records the outcome with a new seq', async () => {
    api.run.mockResolvedValue({ ok: true })

    await useContextDrillStore.getState().run('s1')
    const first = useContextDrillStore.getState().outcomes.s1!
    await useContextDrillStore.getState().run('s1')
    const second = useContextDrillStore.getState().outcomes.s1!

    expect(first.outcome).toEqual({ ok: true })
    expect(second.seq).toBeGreaterThan(first.seq)
  })

  it('run captures the context figure before the compaction destroys it', async () => {
    useSessionStore.setState({ globalSessions: [session('s1', 76)] })
    api.run.mockImplementation(async () => {
      // What the compaction does to the figure, while the call is in flight.
      useSessionStore.setState({ globalSessions: [session('s1', 9)] })
      return { ok: true }
    })

    await useContextDrillStore.getState().run('s1')

    expect(useContextDrillStore.getState().outcomes.s1!.before).toBe(76)
  })

  it('run records a figure of null when nobody measured one', async () => {
    api.run.mockResolvedValue({ ok: true })

    await useContextDrillStore.getState().run('s1')

    expect(useContextDrillStore.getState().outcomes.s1!.before).toBeNull()
  })

  it('cancel remembers that it was asked only when the backend said ok', async () => {
    api.cancel.mockResolvedValue({ ok: true })

    const reason = await useContextDrillStore.getState().cancel('s1')

    expect(reason).toBeNull()
    expect(useContextDrillStore.getState().cancelRequested.s1).toBe(true)
  })

  it('cancel returns the refusal and remembers nothing when the backend said no', async () => {
    api.cancel.mockResolvedValue({
      ok: false,
      reason: 'Compaction cannot be interrupted; it finishes on its own.',
    })

    const reason = await useContextDrillStore.getState().cancel('s1')

    expect(reason).toBe(
      'Compaction cannot be interrupted; it finishes on its own.',
    )
    expect(useContextDrillStore.getState().cancelRequested.s1).toBeUndefined()
  })

  it('a change with a beat records what the routine is doing now', () => {
    useContextDrillStore
      .getState()
      .handleChange({ sessionId: 's1', beat: 'compacting' })

    expect(useContextDrillStore.getState().beats.s1).toBe('compacting')
  })

  it('a change with beat null clears the beat and refreshes', async () => {
    api.describe.mockResolvedValue(READY)
    useContextDrillStore
      .getState()
      .handleChange({ sessionId: 's1', beat: 'resuming' })

    useContextDrillStore
      .getState()
      .handleChange({ sessionId: 's1', beat: null })

    expect(useContextDrillStore.getState().beats.s1).toBeUndefined()
    await vi.waitFor(() =>
      expect(useContextDrillStore.getState().descriptions.s1).toEqual(READY),
    )
  })

  it('subscribes once: a second subscribe replaces the first listener', () => {
    const first = vi.fn()
    const second = vi.fn()
    api.onChanged.mockReturnValueOnce(first).mockReturnValueOnce(second)

    useContextDrillStore.getState().subscribe()
    useContextDrillStore.getState().subscribe()

    expect(api.onChanged).toHaveBeenCalledTimes(2)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('a stale teardown does not unsubscribe the live listener', () => {
    const first = vi.fn()
    const second = vi.fn()
    api.onChanged.mockReturnValueOnce(first).mockReturnValueOnce(second)

    const staleTeardown = useContextDrillStore.getState().subscribe()
    useContextDrillStore.getState().subscribe()
    staleTeardown()

    expect(second).not.toHaveBeenCalled()
    expect(useContextDrillStore.getState().unsubscribe).not.toBeNull()
  })

  it('clearCancelRequested forgets the flag', () => {
    useContextDrillStore.setState({ cancelRequested: { s1: true } })

    useContextDrillStore.getState().clearCancelRequested('s1')

    expect(useContextDrillStore.getState().cancelRequested.s1).toBeUndefined()
  })
})
