import { describe, expect, it } from 'vitest'
import {
  sectionWaveRows,
  UNWAVED_GROUP,
  waveHeader,
  waveRailCounts,
  waveRowAction,
  waveRowInertReason,
  waveRowsFromSnapshots,
  type WaveRow,
} from './wave-sections.pure'
import { ledgerEntry } from './wave-rows.fixture'

const NOW = Date.parse('2026-09-17T12:10:00.000Z')
const ids = (rows: WaveRow[]) => rows.map((row) => row.entry.issueIdentifier)

/** Eight rows, every state at least once, and one without a wave. */
const ROWS = [
  ledgerEntry({ issueIdentifier: 'EX-1', state: 'reviewed' }),
  ledgerEntry({ issueIdentifier: 'EX-2', state: 'working' }),
  ledgerEntry({ issueIdentifier: 'EX-3', state: 'returned' }),
  ledgerEntry({ issueIdentifier: 'EX-4', state: 'assigned' }),
  ledgerEntry({ issueIdentifier: 'EX-5', state: 'done' }),
  ledgerEntry({ issueIdentifier: 'EX-6', state: 'unassigned', seat: null }),
  ledgerEntry({ issueIdentifier: 'EX-7', state: 'working', wave: 'loom-p1' }),
  ledgerEntry({ issueIdentifier: 'EX-8', state: 'assigned', wave: null }),
]

describe('MAR-3097 R1: the sections are a pure function of the rows', () => {
  it('sorts eight rows into the four sections; done and unassigned only in Waves', () => {
    const sections = sectionWaveRows(ROWS, NOW)

    // Mutation: put `returned` into Waiting on you -> red here.
    expect(ids(sections.waitingOnYou)).toEqual(['EX-1'])
    expect(ids(sections.inTheWave)).toEqual(['EX-2', 'EX-3', 'EX-7'])
    expect(ids(sections.waitingToStart)).toEqual(['EX-4', 'EX-8'])
    expect(
      sections.waves.map((group) => [group.wave, ids(group.rows)]),
    ).toEqual([
      ['loom-p1', ['EX-7']],
      ['loom-p2', ['EX-1', 'EX-2', 'EX-3', 'EX-4', 'EX-5', 'EX-6']],
      [UNWAVED_GROUP, ['EX-8']],
    ])
  })
})

describe('MAR-3097 R4: the rail counts are the section lengths', () => {
  it('reads each count off the same sections', () => {
    const sections = sectionWaveRows(ROWS, NOW)
    expect(waveRailCounts(sections)).toEqual({
      waitingOnYou: sections.waitingOnYou.length,
      inTheWave: sections.inTheWave.length,
      waitingToStart: sections.waitingToStart.length,
      waves: sections.waves.length,
    })
  })
})

describe('MAR-3097 R2: the human action, derived', () => {
  it.each([
    [{ state: 'reviewed' as const }, 'QA and say done'],
    [{ state: 'returned' as const }, 'verdict (Fable)'],
    [{ state: 'working' as const, sessionId: null }, 'seat not in crew'],
    [
      {
        state: 'working' as const,
        hostLiveness: {
          executionHost: 'lm',
          lastEventAt: '2026-09-17T12:06:00.000Z',
          hostReachable: false,
        },
      },
      'host unreachable since 4m',
    ],
    [{ state: 'working' as const }, null],
    [{ state: 'assigned' as const }, null],
  ])('%o -> %s', (overrides, action) => {
    expect(
      waveRowAction(
        ledgerEntry({ issueIdentifier: 'EX-9', ...overrides }),
        NOW,
      ),
    ).toBe(action)
  })
})

describe('MAR-3097 R3: the header says an outage by its age', () => {
  const health = (
    state:
      | 'ok'
      | 'unreachable'
      | 'unauthorized'
      | 'rate-limited'
      | 'bad-response',
  ) => ({
    state,
    since: '2026-09-17T12:00:00.000Z',
    lastOkAt: '2026-09-17T11:59:00.000Z',
    backoffUntil: null,
  })

  it.each([
    ['unreachable', 'tracker unreachable · 10m'],
    ['unauthorized', 'tracker key refused · 10m'],
    ['rate-limited', 'tracker rate-limited · 10m'],
    ['bad-response', 'tracker answered badly · 10m'],
  ] as const)('%s -> %s, whatever the row count', (state, text) => {
    for (const rowCount of [0, 3]) {
      expect(
        waveHeader({
          boundCrewCount: 1,
          healths: [health(state)],
          rowCount,
          now: NOW,
        }),
      ).toEqual({ kind: 'outage', text })
    }
  })

  it('no binding -> connect; a binding with no rows -> quiet; rows -> live', () => {
    expect(
      waveHeader({ boundCrewCount: 0, healths: [], rowCount: 0, now: NOW }),
    ).toEqual({ kind: 'connect', text: 'Connect a tracker' })
    expect(
      waveHeader({
        boundCrewCount: 1,
        healths: [health('ok')],
        rowCount: 0,
        now: NOW,
      }),
    ).toEqual({ kind: 'quiet', text: 'Quiet project' })
    expect(
      waveHeader({ boundCrewCount: 1, healths: [null], rowCount: 2, now: NOW })
        .kind,
    ).toBe('live')
  })
})

describe('MAR-3097 R5: a row that cannot open says why', () => {
  it('names a seat without a conversation and a conversation not loaded', () => {
    const known = (id: string) => id === 'session-opus'
    expect(waveRowInertReason({ sessionId: 'session-opus' }, known)).toBeNull()
    expect(waveRowInertReason({ sessionId: null }, known)).toBe(
      'no conversation for this seat',
    )
    expect(waveRowInertReason({ sessionId: 'gone' }, known)).toBe(
      'conversation not loaded',
    )
  })

  it('reads only the bound crews’ snapshots, in crew order', () => {
    const snapshot = (crewId: string, identifier: string) => ({
      crewId,
      entries: [ledgerEntry({ issueIdentifier: identifier, crewId })],
      trackerHealth: null,
    })
    expect(
      waveRowsFromSnapshots(
        {
          a: snapshot('a', 'EX-A'),
          b: snapshot('b', 'EX-B'),
          c: snapshot('c', 'EX-C'),
        },
        ['c', 'a'],
      ).map((entry) => entry.issueIdentifier),
    ).toEqual(['EX-C', 'EX-A'])
  })
})
