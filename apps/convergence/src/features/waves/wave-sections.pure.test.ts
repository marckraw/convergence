import { describe, expect, it } from 'vitest'
import type { TrackerHealth } from '@/entities/work-ledger'
import {
  effectiveWavePanelMode,
  resolveWaveRow,
  sectionWaveRows,
  UNWAVED_GROUP,
  WAVE_PANEL_COLUMN_WIDTH,
  WAVE_PANEL_MIN_MAIN_WIDTH,
  waveBoardLine,
  waveHeader,
  waveRailCounts,
  waveRowAction,
  waveRowHostMarker,
  waveRowKey,
  waveRowsFromSnapshots,
  waveLapLabel,
  type WaveRow,
} from './wave-sections.pure'
import { ledgerEntry } from './wave-rows.fixture'
import { WAVE_PANEL_COLUMN_CLASS } from './wave-panel.styles'

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

const health = (state: TrackerHealth['state']): TrackerHealth => ({
  state,
  since: '2026-09-17T12:00:00.000Z',
  lastOkAt: '2026-09-17T11:59:00.000Z',
  backoffUntil: null,
})

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
    expect(waveBoardLine(sections)).toBe('8 issues · 1 waiting on you')
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

describe('MAR-3097 R2: the human action, derived from the state', () => {
  it.each([
    [{ state: 'reviewed' as const }, 'QA and say done'],
    [{ state: 'returned' as const }, 'verdict (Fable)'],
    [{ state: 'working' as const, sessionId: null }, 'seat not in crew'],
    [{ state: 'working' as const }, null],
    [{ state: 'assigned' as const }, null],
  ])('%o -> %s', (overrides, action) => {
    expect(
      waveRowAction(ledgerEntry({ issueIdentifier: 'EX-9', ...overrides })),
    ).toBe(action)
  })
})

describe('MAR-3097 lap 2, F1: the host outage is a second marker, never on unstarted work', () => {
  const down = {
    executionHost: 'lm',
    lastEventAt: '2026-09-17T12:06:00.000Z',
    hostReachable: false,
  }

  it.each([
    ['reviewed', 'QA and say done', null],
    ['returned', 'verdict (Fable)', 'host unreachable since 4m'],
    ['working', null, 'host unreachable since 4m'],
    ['assigned', null, null],
  ] as const)(
    '%s on a down host -> action %s, marker %s',
    (state, action, marker) => {
      const entry = ledgerEntry({
        issueIdentifier: 'EX-9',
        state,
        hostLiveness: down,
      })
      // Mutation: let the host outage replace the action (first match) -> the
      // returned row loses "verdict (Fable)", red.
      const [row] = sectionWaveRows([entry], NOW).waves[0]!.rows
      expect([row!.action, row!.hostMarker]).toEqual([action, marker])
      expect(waveRowHostMarker(entry, NOW)).toBe(marker)
    },
  )
})

describe('MAR-3097 R3 + lap 2, A: the header', () => {
  it.each([
    ['unreachable', 'tracker unreachable · 10m'],
    ['unauthorized', 'tracker key refused · 10m'],
    ['rate-limited', 'tracker rate-limited · 10m'],
    ['bad-response', 'tracker answered badly · 10m'],
  ] as const)('%s -> %s, whatever the row count', (state, text) => {
    for (const rowCount of [0, 3]) {
      expect(
        waveHeader({
          crews: [{ name: 'Loom', health: health(state) }],
          rowCount,
          now: NOW,
        }),
      ).toEqual({ kind: 'outage', text })
    }
  })

  it('A: a tracker not yet heard from is being read, never quiet -- with or without rows', () => {
    for (const rowCount of [0, 2]) {
      // Mutation: drop the null branch -> zero rows read "Quiet project", red.
      expect(
        waveHeader({
          crews: [{ name: 'Loom', health: null }],
          rowCount,
          now: NOW,
        }),
      ).toEqual({ kind: 'reading', text: 'reading the tracker…' })
    }
    expect(
      waveHeader({
        crews: [
          { name: 'Loom', health: health('ok') },
          { name: 'Night shift', health: null },
        ],
        rowCount: 0,
        now: NOW,
      }).kind,
    ).toBe('reading')
  })

  it('no binding -> connect; every tracker answered with zero rows -> quiet; rows -> live', () => {
    expect(waveHeader({ crews: [], rowCount: 0, now: NOW })).toEqual({
      kind: 'connect',
      text: 'Connect a tracker',
    })
    expect(
      waveHeader({
        crews: [{ name: 'Loom', health: health('ok') }],
        rowCount: 0,
        now: NOW,
      }),
    ).toEqual({ kind: 'quiet', text: 'Quiet project' })
    expect(
      waveHeader({
        crews: [{ name: 'Loom', health: health('ok') }],
        rowCount: 2,
        now: NOW,
      }).kind,
    ).toBe('live')
  })

  it('E: with several crews, each unhealthy crew is named with its own age', () => {
    expect(
      waveHeader({
        crews: [
          { name: 'Loom', health: health('ok') },
          { name: 'Night shift', health: health('unreachable') },
          {
            name: 'Day shift',
            health: {
              ...health('unauthorized'),
              since: '2026-09-17T12:08:00.000Z',
            },
          },
        ],
        rowCount: 4,
        now: NOW,
      }),
    ).toEqual({
      kind: 'outage',
      text: 'tracker unreachable · Night shift · 10m; tracker key refused · Day shift · 2m',
    })
  })
})

describe('MAR-3097 R5 + lap 2, F4: a row resolves its seat once', () => {
  it('opens a known session and names why it cannot otherwise', () => {
    const find = (id: string) => (id === 'session-opus' ? { id } : null)
    expect(resolveWaveRow({ sessionId: 'session-opus' }, find)).toEqual({
      openable: true,
      session: { id: 'session-opus' },
    })
    expect(resolveWaveRow({ sessionId: null }, find)).toEqual({
      openable: false,
      reason: 'no conversation for this seat',
    })
    expect(resolveWaveRow({ sessionId: 'gone' }, find)).toEqual({
      openable: false,
      reason: 'conversation not loaded',
    })
  })
})

describe('MAR-3097 lap 2, E: crews on rows', () => {
  it('names the crew on each row only when asked, and keys rows uniquely', () => {
    const rows = [
      ledgerEntry({ issueIdentifier: 'EX-1', crewId: 'a' }),
      ledgerEntry({ issueIdentifier: 'EX-1', crewId: 'b' }),
    ]
    const named = sectionWaveRows(rows, NOW, (crewId) => ({
      name: `crew ${crewId}`,
      cap: null,
    }))
    expect(named.inTheWave.map((row) => row.crewName)).toEqual([
      'crew a',
      'crew b',
    ])
    expect(
      sectionWaveRows(rows, NOW).inTheWave.map((row) => row.crewName),
    ).toEqual([null, null])
    expect(new Set(rows.map(waveRowKey)).size).toBe(2)
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

describe('MAR-3097 lap 2, B: the column keeps the main panel at its floor', () => {
  it('renders the rail when the window is too narrow, and says which reason', () => {
    const wide = 260 + WAVE_PANEL_COLUMN_WIDTH + WAVE_PANEL_MIN_MAIN_WIDTH
    expect(
      effectiveWavePanelMode({
        stored: 'open',
        windowWidth: wide,
        reservedWidth: 260,
      }),
    ).toEqual({ mode: 'open', reason: null })
    // MAR-3148 R1: the rail has two causes, and only one of them can be
    // undone by clicking Open.
    expect(
      effectiveWavePanelMode({
        stored: 'open',
        windowWidth: wide - 1,
        reservedWidth: 260,
      }),
    ).toEqual({ mode: 'rail', reason: 'narrow' })
    expect(
      effectiveWavePanelMode({
        stored: 'rail',
        windowWidth: 4000,
        reservedWidth: 0,
      }),
    ).toEqual({ mode: 'rail', reason: 'stored' })
    // Lap 2, B: the width answers first. A stored rail in a window that could
    // not hold the column either reads `narrow`, because that is why Open
    // cannot act -- answering `stored` left the control live over nothing.
    // Mutation: ask the stored mode first -> red.
    expect(
      effectiveWavePanelMode({
        stored: 'rail',
        windowWidth: wide - 1,
        reservedWidth: 260,
      }),
    ).toEqual({ mode: 'rail', reason: 'narrow' })
  })

  it('MAR-3148 R5: the column’s width is one fact, not two', () => {
    // The class the column renders with and the number the floor is measured
    // against must be the same width, or the panel fits on screen and not in
    // the arithmetic (or the other way round).
    expect(WAVE_PANEL_COLUMN_CLASS).toContain(
      `w-[${WAVE_PANEL_COLUMN_WIDTH}px]`,
    )
  })
})

describe('MAR-3085 R7: the lap, the cap and the ruling on the row', () => {
  it('a stopped lap rides In the wave with "re-groom (Fable)", counted there', () => {
    const rows = [
      ledgerEntry({
        issueIdentifier: 'EX-1',
        state: 'stopped',
        lap: 3,
        verdict: 'stop',
      }),
    ]
    const sections = sectionWaveRows(rows, NOW, () => ({ name: null, cap: 6 }))

    // Mutation: put `stopped` under Waiting on you -> red.
    expect(sections.waitingOnYou).toEqual([])
    expect(sections.inTheWave.map((row) => row.action)).toEqual([
      're-groom (Fable)',
    ])
    expect(waveRailCounts(sections).inTheWave).toBe(1)
    expect(sections.inTheWave[0]!.lapLabel).toBe('lap 3 of 6')
  })

  it('a row says the lap alone; the `of N` form waits for a real lap cap', () => {
    expect(waveLapLabel(3, null)).toBe('lap 3')
    // The only form on screen today (lap 2, E): the board passes no cap.
    // `of N` is pinned here rather than in a rendered case, because no
    // rendered path can reach it until a true lap cap exists (MAR-3149).
    expect(waveLapLabel(3, 6)).toBe('lap 3 of 6')
    expect(waveLapLabel(1, 24)).toBe('lap 1 of 24')
    expect(
      sectionWaveRows([ledgerEntry({ issueIdentifier: 'EX-1', lap: 2 })], NOW)
        .inTheWave[0]!.lapLabel,
    ).toBe('lap 2')
  })
})
