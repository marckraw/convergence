import { describe, expect, it } from 'vitest'
import type { SessionStatus, SessionSummary } from '@/entities/session'
import type { ContextAlertSettings } from '@/shared/lib/context-alert-settings.pure'
import {
  nextCrossings,
  type CrossingState,
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

function map(entries: Record<string, CrossingState>) {
  return new Map<string, CrossingState>(Object.entries(entries))
}

describe('nextCrossings', () => {
  it('tells a session that is over and at a turn boundary', () => {
    const result = nextCrossings(new Map(), [session('a', 80)], alert, false)

    expect(result.toTell.map((c) => c.session.id)).toEqual(['a'])
    expect(result.state.get('a')).toBe('told')
  })

  it('hands the toast the figure and the limit it should name', () => {
    // 80 % of a 200k window is 160k: past the percent, under the 400k cap.
    const byPercent = nextCrossings(new Map(), [session('a', 80)], alert, false)
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
    const byTokens = nextCrossings(new Map(), [big], alert, false)
    expect(byTokens.toTell[0]).toMatchObject({
      usedPercentage: 41,
      by: 'tokens',
    })
  })

  it('does not tell twice about one crossing', () => {
    const result = nextCrossings(
      map({ a: 'told' }),
      [session('a', 80)],
      alert,
      false,
    )

    expect(result.toTell).toEqual([])
    expect(result.state.get('a')).toBe('told')
  })

  it('stays quiet while a session is over but mid-turn', () => {
    const result = nextCrossings(
      map({ a: 'armed' }),
      [session('a', 80, 'running')],
      alert,
      false,
    )

    expect(result.toTell).toEqual([])
    expect(result.state.get('a')).toBe('armed')
  })

  it('arms a session that is not over', () => {
    const result = nextCrossings(
      map({ a: 'told' }),
      [session('a', 20)],
      alert,
      false,
    )

    expect(result.toTell).toEqual([])
    expect(result.state.get('a')).toBe('armed')
  })

  it('tells again after a drop and a second crossing', () => {
    const first = nextCrossings(new Map(), [session('a', 80)], alert, false)
    expect(first.toTell.map((c) => c.session.id)).toEqual(['a'])

    // The compaction: the figure drops under the line and the session re-arms.
    const dropped = nextCrossings(first.state, [session('a', 20)], alert, false)
    expect(dropped.toTell).toEqual([])
    expect(dropped.state.get('a')).toBe('armed')

    const again = nextCrossings(dropped.state, [session('a', 80)], alert, false)
    expect(again.toTell.map((c) => c.session.id)).toEqual(['a'])
  })

  it('tells nobody on the first observation', () => {
    const result = nextCrossings(
      new Map(),
      [session('a', 80), session('b', 90), session('c', 20)],
      alert,
      true,
    )

    expect(result.toTell).toEqual([])
    expect(result.state.get('a')).toBe('told')
    expect(result.state.get('b')).toBe('told')
    expect(result.state.get('c')).toBe('armed')
  })

  it('drops a session that is no longer in the list', () => {
    const result = nextCrossings(
      map({ a: 'told', gone: 'told' }),
      [session('a', 80)],
      alert,
      false,
    )

    expect(result.state.has('gone')).toBe(false)
    expect([...result.state.keys()]).toEqual(['a'])
  })

  it('tells nobody and arms everything when the alert is off', () => {
    const result = nextCrossings(
      map({ a: 'told' }),
      [session('a', 95), session('b', 80)],
      { ...alert, enabled: false },
      false,
    )

    expect(result.toTell).toEqual([])
    expect(result.state.get('a')).toBe('armed')
    expect(result.state.get('b')).toBe('armed')
  })

  it('tells at the boundary a mid-turn crossing waited for', () => {
    const midTurn = nextCrossings(
      new Map(),
      [session('a', 80, 'running')],
      alert,
      false,
    )
    expect(midTurn.toTell).toEqual([])

    const settled = nextCrossings(
      midTurn.state,
      [session('a', 80)],
      alert,
      false,
    )
    expect(settled.toTell.map((c) => c.session.id)).toEqual(['a'])
  })

  it('treats answered and failed as mid-turn, not as a boundary', () => {
    for (const status of ['answered', 'failed', 'idle'] as SessionStatus[]) {
      const result = nextCrossings(
        new Map(),
        [session('a', 80, status)],
        alert,
        false,
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

    const result = nextCrossings(new Map(), [cursor], alert, false)
    expect(result.toTell).toEqual([])
    expect(result.state.get('cursor')).toBe('armed')
  })
})
