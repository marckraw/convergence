import { describe, expect, it } from 'vitest'
import type { SessionStatus, SessionSummary } from '@/entities/session'
import type { ContextAlertSettings } from '@/shared/lib/context-alert-settings.pure'
import {
  initialCrossingsState,
  nextCrossings,
  type CrossingsState,
  type SessionCrossingState,
} from './context-alert-crossings.pure'

const alert: ContextAlertSettings = {
  enabled: true,
  percent: 75,
  tokens: 400000,
}

function session(
  id: string,
  usedPercentage: number,
  status: SessionStatus = 'completed',
): SessionSummary {
  const windowTokens = 200000
  const usedTokens = Math.round((usedPercentage / 100) * windowTokens)
  return {
    id,
    name: `Session ${id}`,
    status,
    contextWindow: {
      availability: 'available',
      source: 'provider',
      usedTokens,
      windowTokens,
      usedPercentage,
      remainingPercentage: 100 - usedPercentage,
    },
  } as SessionSummary
}

/**
 * A state as it would stand after earlier passes. `sawTurn` defaults to true
 * because most of these cases are about the `told` half; the cases that are
 * about `sawTurn` itself run the real sequence of passes instead of seeding.
 */
function priorState(
  entries: Record<string, Partial<SessionCrossingState>>,
  takenAgainst: ContextAlertSettings = alert,
): CrossingsState {
  return {
    alert: takenAgainst,
    sessions: new Map(
      Object.entries(entries).map(([id, entry]) => [
        id,
        { told: false, sawTurn: true, ...entry },
      ]),
    ),
  }
}

function ids(result: { toTell: { session: SessionSummary }[] }) {
  return result.toTell.map((crossing) => crossing.session.id)
}

describe('nextCrossings', () => {
  it('tells a session that is over and at a turn boundary', () => {
    const result = nextCrossings(
      priorState({ a: {} }),
      [session('a', 80)],
      alert,
    )

    expect(ids(result)).toEqual(['a'])
    expect(result.state.sessions.get('a')?.told).toBe(true)
  })

  it('hands the toast the figure and the limit it should name', () => {
    // 80 % of a 200k window is 160k: past the percent, under the 400k cap.
    const byPercent = nextCrossings(
      priorState({ a: {} }),
      [session('a', 80)],
      alert,
    )
    expect(byPercent.toTell[0]).toMatchObject({
      usedPercentage: 80,
      by: 'percent',
    })

    const big = {
      id: 'b',
      name: 'Session b',
      status: 'completed',
      contextWindow: {
        availability: 'available',
        source: 'provider',
        usedTokens: 410000,
        windowTokens: 1000000,
        usedPercentage: 41,
        remainingPercentage: 59,
      },
    } as SessionSummary
    const byTokens = nextCrossings(priorState({ b: {} }), [big], alert)
    expect(byTokens.toTell[0]).toMatchObject({
      usedPercentage: 41,
      by: 'tokens',
    })
  })

  it('does not tell twice about one crossing', () => {
    const result = nextCrossings(
      priorState({ a: { told: true } }),
      [session('a', 80)],
      alert,
    )

    expect(result.toTell).toEqual([])
    expect(result.state.sessions.get('a')?.told).toBe(true)
  })

  it('stays quiet while a session is over but mid-turn', () => {
    const result = nextCrossings(
      priorState({ a: {} }),
      [session('a', 80, 'running')],
      alert,
    )

    expect(result.toTell).toEqual([])
    expect(result.state.sessions.get('a')?.told).toBe(false)
  })

  it('arms a session that is not over', () => {
    const result = nextCrossings(
      priorState({ a: { told: true } }),
      [session('a', 20)],
      alert,
    )

    expect(result.toTell).toEqual([])
    expect(result.state.sessions.get('a')?.told).toBe(false)
  })

  it('does not tell a conversation first seen idle and over', () => {
    const first = nextCrossings(
      initialCrossingsState(),
      [session('a', 80), session('b', 90), session('c', 20)],
      alert,
    )
    expect(first.toTell).toEqual([])

    // And it stays quiet: sitting there over the line is not an event.
    const second = nextCrossings(
      first.state,
      [session('a', 80), session('b', 90), session('c', 20)],
      alert,
    )
    expect(second.toTell).toEqual([])
  })

  it('tells a conversation first seen running, when it completes over', () => {
    const midTurn = nextCrossings(
      initialCrossingsState(),
      [session('a', 80, 'running')],
      alert,
    )
    expect(midTurn.toTell).toEqual([])

    const settled = nextCrossings(midTurn.state, [session('a', 80)], alert)
    expect(ids(settled)).toEqual(['a'])
  })

  it('tells when the figure crosses just after the turn settled', () => {
    // Claude patches the context figure after the settle, so the crossing can
    // land an observation later, with `completed` on both sides of it.
    const running = nextCrossings(
      initialCrossingsState(),
      [session('a', 74, 'running')],
      alert,
    )
    const settled = nextCrossings(running.state, [session('a', 74)], alert)
    expect(settled.toTell).toEqual([])

    const patched = nextCrossings(settled.state, [session('a', 76)], alert)
    expect(ids(patched)).toEqual(['a'])
  })

  it('does not tell when the threshold is lowered onto idle conversations', () => {
    // Three conversations that worked under our watch and settled well under
    // the line.
    const working = nextCrossings(
      initialCrossingsState(),
      [
        session('a', 30, 'running'),
        session('b', 40, 'running'),
        session('c', 50, 'running'),
      ],
      alert,
    )
    const idle = nextCrossings(
      working.state,
      [session('a', 30), session('b', 40), session('c', 50)],
      alert,
    )
    expect(idle.toTell).toEqual([])

    // Marcin lowers the threshold in Settings. Nothing ended a turn, so
    // nothing is said -- this is QA step 2.
    const lowered = nextCrossings(
      idle.state,
      [session('a', 30), session('b', 40), session('c', 50)],
      { ...alert, percent: 5 },
    )
    expect(lowered.toTell).toEqual([])
  })

  it('tells when the next turn ends after the threshold was lowered', () => {
    const lowered = nextCrossings(priorState({ a: {} }), [session('a', 30)], {
      ...alert,
      percent: 5,
    })
    expect(lowered.toTell).toEqual([])

    const lowAlert = { ...alert, percent: 5 }
    const running = nextCrossings(
      lowered.state,
      [session('a', 30, 'running')],
      lowAlert,
    )
    expect(running.toTell).toEqual([])

    const settled = nextCrossings(running.state, [session('a', 30)], lowAlert)
    expect(ids(settled)).toEqual(['a'])
  })

  it('a settings change while a turn runs still tells at its end', () => {
    const running = nextCrossings(
      initialCrossingsState(),
      [session('a', 80, 'running')],
      alert,
    )
    expect(running.toTell).toEqual([])

    // The threshold moves mid-turn. The re-baseline wipes `sawTurn`, and the
    // status read in that same pass sets it again at once.
    const moved = nextCrossings(running.state, [session('a', 80, 'running')], {
      ...alert,
      percent: 70,
    })
    expect(moved.toTell).toEqual([])

    const settled = nextCrossings(moved.state, [session('a', 80)], {
      ...alert,
      percent: 70,
    })
    expect(ids(settled)).toEqual(['a'])
  })

  it('treats a settings object rebuilt with the same values as no change', () => {
    // The settings store hands out a fresh object on every broadcast. If that
    // counted as a change it would re-baseline constantly and swallow real
    // crossings.
    const running = nextCrossings(
      initialCrossingsState(),
      [session('a', 80, 'running')],
      { ...alert },
    )
    const settled = nextCrossings(running.state, [session('a', 80)], {
      ...alert,
    })

    expect(ids(settled)).toEqual(['a'])
  })

  it('tells again after a drop and a second crossing', () => {
    const working = nextCrossings(
      initialCrossingsState(),
      [session('a', 20, 'running')],
      alert,
    )
    const first = nextCrossings(working.state, [session('a', 80)], alert)
    expect(ids(first)).toEqual(['a'])

    // The compaction: the figure drops under the line and the session re-arms.
    const dropped = nextCrossings(first.state, [session('a', 20)], alert)
    expect(dropped.toTell).toEqual([])
    expect(dropped.state.sessions.get('a')?.told).toBe(false)

    const again = nextCrossings(dropped.state, [session('a', 80)], alert)
    expect(ids(again)).toEqual(['a'])
  })

  it('drops a session that is no longer in the list', () => {
    const result = nextCrossings(
      priorState({ a: { told: true }, gone: { told: true } }),
      [session('a', 80)],
      alert,
    )

    expect(result.state.sessions.has('gone')).toBe(false)
    expect([...result.state.sessions.keys()]).toEqual(['a'])
  })

  it('tells nobody and arms everything when the alert is off', () => {
    const result = nextCrossings(
      priorState({ a: { told: true }, b: {} }, { ...alert, enabled: false }),
      [session('a', 95), session('b', 80)],
      { ...alert, enabled: false },
    )

    expect(result.toTell).toEqual([])
    expect(result.state.sessions.get('a')?.told).toBe(false)
    expect(result.state.sessions.get('b')?.told).toBe(false)
  })

  it('treats answered and failed as mid-turn, not as a boundary', () => {
    for (const status of ['answered', 'failed', 'idle'] as SessionStatus[]) {
      const result = nextCrossings(
        priorState({ a: {} }),
        [session('a', 80, status)],
        alert,
      )
      expect(result.toTell, status).toEqual([])
    }
  })

  it('never tells about a session the provider reports no usage for', () => {
    const cursor = {
      id: 'cursor',
      name: 'Cursor session',
      status: 'completed',
      contextWindow: {
        availability: 'unavailable',
        source: 'provider',
        reason: 'Cursor does not report context usage.',
      },
    } as SessionSummary

    const result = nextCrossings(priorState({ cursor: {} }), [cursor], alert)
    expect(result.toTell).toEqual([])
    expect(result.state.sessions.get('cursor')?.told).toBe(false)
  })
})
