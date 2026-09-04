import { describe, expect, it } from 'vitest'
import {
  CREW_LIVE_WINDOW_MS,
  DEFAULT_CREW_STALL_MINUTES,
  findStalledStations,
  formatCrewHailDetail,
  resolveStallMinutes,
} from './crew-hail.pure'

const MINUTE_MS = 60_000

function hop(overrides: {
  id?: string
  firedAt: string
  outcome?: string
  targetSessionId?: string | null
  spawnedSessionId?: string | null
  settledAt?: string | null
  settledStatus?: string | null
}) {
  return {
    id: overrides.id ?? 'hop-1',
    flowRunId: 'run-1',
    outcome: overrides.outcome ?? 'delivered',
    firedAt: overrides.firedAt,
    targetSessionId:
      overrides.targetSessionId === undefined
        ? 'codex'
        : overrides.targetSessionId,
    spawnedSessionId: overrides.spawnedSessionId ?? null,
    // Null is "the station has not come back", which is what every row
    // written before this column existed honestly says.
    settledAt: overrides.settledAt ?? null,
    settledStatus: overrides.settledStatus ?? null,
  }
}

const NOW = new Date('2026-09-01T12:00:00.000Z')

function firedMinutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * MINUTE_MS).toISOString()
}

describe('resolveStallMinutes', () => {
  it('defaults to thirty minutes when a crew names nothing', () => {
    expect(resolveStallMinutes(null)).toBe(DEFAULT_CREW_STALL_MINUTES)
    expect(DEFAULT_CREW_STALL_MINUTES).toBe(30)
  })

  it('takes a crew own window when it named one', () => {
    expect(resolveStallMinutes(5)).toBe(5)
  })

  it('falls back for a window no crew could have meant', () => {
    expect(resolveStallMinutes(0)).toBe(DEFAULT_CREW_STALL_MINUTES)
    expect(resolveStallMinutes(-1)).toBe(DEFAULT_CREW_STALL_MINUTES)
  })
})

describe('findStalledStations', () => {
  it('names the station that took the work and never came back', () => {
    expect(
      findStalledStations({
        hops: [hop({ firedAt: firedMinutesAgo(31) })],
        now: NOW,
        stallMinutes: 30,
      }),
      // The stall clock's two inputs together: a station that never came
      // back is quiet, and the fate is what the sentence is written from.
    ).toEqual([
      {
        sessionId: 'codex',
        hopId: 'hop-1',
        flowRunId: 'run-1',
        fate: 'quiet',
      },
    ])
  })

  it('waits until the window has actually passed', () => {
    expect(
      findStalledStations({
        hops: [hop({ firedAt: firedMinutesAgo(29) })],
        now: NOW,
        stallMinutes: 30,
      }),
    ).toEqual([])
  })

  it('says nothing about a crew that never fired', () => {
    expect(
      findStalledStations({ hops: [], now: NOW, stallMinutes: 30 }),
    ).toEqual([])
  })

  it('does not let a newer refusal bury the station it refused for', () => {
    // The failed nonterminal: s2 took the work and failed, and its own wires
    // then wrote `skipped-failed` refusals on top of the trail. The debt is
    // per STATION, so a newer row that spent nothing must not silence the
    // older row that is still owed.
    expect(
      findStalledStations({
        hops: [
          hop({
            id: 'refusal',
            firedAt: firedMinutesAgo(40),
            outcome: 'skipped-failed',
          }),
          hop({
            id: 'owed',
            firedAt: firedMinutesAgo(45),
            settledAt: firedMinutesAgo(41),
            settledStatus: 'failed',
          }),
        ],
        now: NOW,
        stallMinutes: 30,
      }),
    ).toEqual([
      { sessionId: 'codex', hopId: 'owed', flowRunId: 'run-1', fate: 'failed' },
    ])
  })

  it('does not let a healthy sibling hide a hung station in a fan-out', () => {
    expect(
      findStalledStations({
        hops: [
          hop({
            id: 'healthy',
            firedAt: firedMinutesAgo(40),
            targetSessionId: 'sibling',
            settledAt: firedMinutesAgo(35),
            settledStatus: 'completed',
          }),
          hop({ id: 'hung', firedAt: firedMinutesAgo(45) }),
        ],
        now: NOW,
        stallMinutes: 30,
      }),
    ).toEqual([
      { sessionId: 'codex', hopId: 'hung', flowRunId: 'run-1', fate: 'quiet' },
    ])
  })

  it('names every outstanding station at once', () => {
    expect(
      findStalledStations({
        hops: [
          hop({ id: 'h2', firedAt: firedMinutesAgo(40), targetSessionId: 'b' }),
          hop({ id: 'h1', firedAt: firedMinutesAgo(45), targetSessionId: 'a' }),
        ],
        now: NOW,
        stallMinutes: 30,
      }).map((stalled) => stalled.sessionId),
    ).toEqual(['b', 'a'])
  })

  it('asks each station about its NEWEST budgeted hop only', () => {
    // A station holding fresh work is a station mid-turn, not one that
    // abandoned the older row: the newer hop is the fact about it now.
    expect(
      findStalledStations({
        hops: [
          hop({ id: 'fresh', firedAt: firedMinutesAgo(5) }),
          hop({ id: 'stale', firedAt: firedMinutesAgo(45) }),
        ],
        now: NOW,
        stallMinutes: 30,
      }),
    ).toEqual([])
  })

  it('says nothing once the crew is no longer live', () => {
    const beyond = CREW_LIVE_WINDOW_MS / MINUTE_MS + 1
    expect(
      findStalledStations({
        hops: [hop({ firedAt: firedMinutesAgo(beyond) })],
        now: NOW,
        stallMinutes: 30,
      }),
    ).toEqual([])
  })

  it('names a spawned session as readily as a hailed one', () => {
    expect(
      findStalledStations({
        hops: [
          hop({
            firedAt: firedMinutesAgo(31),
            outcome: 'spawned',
            targetSessionId: null,
            spawnedSessionId: 'new-session',
          }),
        ],
        now: NOW,
        stallMinutes: 30,
      })[0]?.sessionId,
    ).toBe('new-session')
  })

  it('says nothing when the hop landed nowhere it can name', () => {
    expect(
      findStalledStations({
        hops: [
          hop({
            firedAt: firedMinutesAgo(31),
            targetSessionId: null,
          }),
        ],
        now: NOW,
        stallMinutes: 30,
      }),
    ).toEqual([])
  })

  it('says nothing about a station that came back', () => {
    // The question is whether this station still owes the landed hop, not
    // how long the clock has run. Every ordinary A -> B delivery leaves its
    // hop unanswered by any later row, so reading the clock alone
    // false-alarms on the default path.
    expect(
      findStalledStations({
        hops: [
          hop({
            firedAt: firedMinutesAgo(45),
            settledAt: firedMinutesAgo(40),
            settledStatus: 'completed',
          }),
        ],
        now: NOW,
        stallMinutes: 30,
      }),
    ).toEqual([])
  })

  it('says nothing about work the user cancelled before the station took it', () => {
    // A cancelled receipt reaches a terminal (MAR-2759): the hop is stamped
    // `cancelled` by the session layer's word, and nothing is owed -- a call
    // about it would accuse a station of silence over work it never had.
    expect(
      findStalledStations({
        hops: [
          hop({
            firedAt: firedMinutesAgo(45),
            settledAt: firedMinutesAgo(40),
            settledStatus: 'cancelled',
          }),
        ],
        now: NOW,
        stallMinutes: 30,
      }),
    ).toEqual([])
  })

  it('says nothing about work abandoned with the session that held it', () => {
    // The receipt lifecycle invariant (MAR-2759, design P): `abandoned` is
    // the user's word too -- the session went, by their hand -- so the stamp
    // carries its own name and the clock reads it as quiet.
    expect(
      findStalledStations({
        hops: [
          hop({
            firedAt: firedMinutesAgo(45),
            settledAt: firedMinutesAgo(40),
            settledStatus: 'abandoned',
          }),
        ],
        now: NOW,
        stallMinutes: 30,
      }),
    ).toEqual([])
  })

  it('hails a broken return without waiting for the window', () => {
    // A station that came back broken -- or a dispatch the system could not
    // run, stamped `failed` by the session layer's word -- has already
    // answered; the window is for silence, and there is no silence here.
    expect(
      findStalledStations({
        hops: [
          hop({
            firedAt: firedMinutesAgo(5),
            settledAt: firedMinutesAgo(4),
            settledStatus: 'failed',
          }),
        ],
        now: NOW,
        stallMinutes: 30,
      }),
    ).toEqual([
      {
        sessionId: 'codex',
        hopId: 'hop-1',
        flowRunId: 'run-1',
        fate: 'failed',
      },
    ])
  })

  it('stays loud about a station that failed after taking the work', () => {
    expect(
      findStalledStations({
        hops: [
          hop({
            firedAt: firedMinutesAgo(45),
            settledAt: firedMinutesAgo(40),
            settledStatus: 'failed',
          }),
        ],
        now: NOW,
        stallMinutes: 30,
      })[0]?.fate,
    ).toBe('failed')
  })

  it('stays loud about a fate it cannot read', () => {
    // A word this build does not know is not a station it can vouch for, so
    // the silence goes to the loud side rather than the quiet one.
    expect(
      findStalledStations({
        hops: [
          hop({
            firedAt: firedMinutesAgo(45),
            settledAt: firedMinutesAgo(40),
            settledStatus: 'evaporated',
          }),
        ],
        now: NOW,
        stallMinutes: 30,
      })[0]?.fate,
    ).toBe('failed')
  })

  it('says nothing about a hop whose time cannot be read', () => {
    expect(
      findStalledStations({
        hops: [hop({ firedAt: 'not a date' })],
        now: NOW,
        stallMinutes: 30,
      }),
    ).toEqual([])
  })
})

describe('formatCrewHailDetail', () => {
  it('says who the work belongs to for a terminal baton', () => {
    expect(formatCrewHailDetail('terminal', { baton: 'marcin' })).toContain(
      'you',
    )
  })

  it('names the baton nothing answered', () => {
    expect(formatCrewHailDetail('unrouted', { baton: 'fabel' })).toContain(
      'fabel',
    )
  })

  it('says a declaration named nobody when there was no name to quote', () => {
    // `BATON:` with nothing after it handed the work on and named nobody. The
    // hail has no baton to quote, and the sentence has to say that rather than
    // fall back to a generic word: a hail that reads "handed on a baton" about
    // a line that named none is a sentence nobody can act on.
    const detail = formatCrewHailDetail('unrouted', { baton: null })
    expect(detail).toContain('named nobody')
    expect(detail).not.toContain('"a baton"')
  })

  it('names the cap the loop reached', () => {
    expect(formatCrewHailDetail('round-budget', { cap: 12 })).toContain('12')
  })

  it('names how long the station has been quiet', () => {
    expect(
      formatCrewHailDetail('stall', { minutes: 30, fate: 'quiet' }),
    ).toContain('30')
  })

  it('says a failed station failed rather than calling it quiet', () => {
    const detail = formatCrewHailDetail('stall', {
      minutes: 30,
      fate: 'failed',
    })
    expect(detail).toContain('failed')
    expect(detail).not.toContain('quiet')
  })

  it('says the lap closed for a loop the law ended', () => {
    expect(formatCrewHailDetail('loop-closed', { baton: 'horse' })).toContain(
      'horse',
    )
  })
})
