import { describe, expect, it } from 'vitest'
import type { TrackerHealth, WorkLedgerEntry } from '@/entities/work-ledger'
import {
  clampWavePanelWidth,
  effectiveWavePanelMode,
  isTerminalWaveRow,
  resolveWaveRow,
  sectionWaveRows,
  settleWavePanelGesture,
  UNWAVED_GROUP,
  WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
  WAVE_PANEL_MAX_COLUMN_WIDTH,
  WAVE_PANEL_MIN_COLUMN_WIDTH,
  WAVE_PANEL_MIN_MAIN_WIDTH,
  waveBoardLine,
  waveHeader,
  waveRowAction,
  waveRowHostMarker,
  waveRowKey,
  waveRowMetaWords,
  waveRowsFromSnapshots,
  waveLapLabel,
  type WaveRow,
} from './wave-sections.pure'
import { ledgerEntry } from './wave-rows.fixture'
import { loomStatusMeaning } from './loom-detail.pure'
import { LOOM_COMPACT_CLASS, LOOM_EXPANDED_CLASS } from './wave-panel.styles'

const NOW = Date.parse('2026-09-17T12:10:00.000Z')
const ids = (rows: WaveRow[]) => rows.map((row) => row.entry.issueIdentifier)

describe('MAR-3199 R5: card words say what happened', () => {
  it.each<{
    name: string
    entry: Partial<WorkLedgerEntry>
    crewName?: string
    words: string[]
  }>([
    {
      name: 'assigned without a seat',
      entry: { state: 'assigned', seat: null },
      words: ['no seat', 'in preparation'],
    },
    {
      name: 'assigned with a seat',
      entry: { state: 'assigned', seat: 'opus-mac' },
      words: ['opus-mac', 'queued'],
    },
    {
      name: 'working with a crew and lap cap',
      entry: { state: 'working', lap: 2 },
      crewName: 'Loom',
      words: ['Loom', 'opus', 'working', 'lap 2 of 6'],
    },
    {
      name: 'reviewed with verdict and PR',
      entry: {
        state: 'reviewed',
        verdict: 'pass',
        pr: {
          number: 678,
          state: 'open',
          url: 'https://github.com/example/repo/pull/678',
          headBranch: 'agent/ex-1',
          checkedAt: '2026-09-17T12:00:00.000Z',
          source: 'gh',
        },
      },
      words: ['opus', 'reviewed', 'lap 1 of 6', 'pass', 'PR #678 open'],
    },
    {
      name: 'unassigned',
      entry: { state: 'unassigned', seat: null },
      words: ['no seat', 'unassigned'],
    },
  ])('$name', ({ entry, crewName, words }) => {
    const row = sectionWaveRows(
      [ledgerEntry({ issueIdentifier: 'EX-1', ...entry })],
      NOW,
      () => ({ name: crewName ?? null, cap: 6 }),
    ).waves[0].rows[0]
    expect(waveRowMetaWords(row)).toEqual(words)
  })

  it('keeps assigned card wording in agreement with the detail, with or without a seat', () => {
    for (const seat of [null, 'opus-mac']) {
      const entry = ledgerEntry({
        issueIdentifier: 'EX-1',
        state: 'assigned',
        seat,
      })
      const row = sectionWaveRows([entry], NOW).waitingToStart[0]
      expect(waveRowMetaWords(row)[1]).toBe(
        loomStatusMeaning(entry).toLowerCase(),
      )
    }
  })
})

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

// `MAR-3097 R4: the rail counts are the section lengths` stood here and went
// with `waveRailCounts` (MAR-3189 lap 2, G): nothing renders the old sections
// as counts any more. Its guarantee -- the collapsed panel reads the SAME
// model the open one draws, never a second selector -- lives in
// `MAR-3189 R4: the strip is the same model` in `wave-panel.render.test.tsx`,
// which asserts the strip's four numbers against `loomSheets`.

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
      dispatchPlan: null,
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
  /** The window that leaves exactly `available` px for the column. */
  const windowLeaving = (available: number, reserved = 260) =>
    reserved + WAVE_PANEL_MIN_MAIN_WIDTH + available

  it('MAR-3189 R4: the bounds are 280 and 400, written down', () => {
    // The law itself, as literals: every other case here reads the constants,
    // so moving both constants together would leave them all green.
    // Mutation: MAX back to 640 -> red.
    expect(WAVE_PANEL_MIN_COLUMN_WIDTH).toBe(280)
    expect(WAVE_PANEL_MAX_COLUMN_WIDTH).toBe(400)
    expect(WAVE_PANEL_DEFAULT_COLUMN_WIDTH).toBe(280)
    expect(clampWavePanelWidth(640, 640)).toBe(400)
    expect(clampWavePanelWidth(200, 400)).toBe(280)
  })

  it('renders the strip when the window is too narrow, and never for any other reason', () => {
    // The column gives way by SHRINKING first, so the strip arrives when even
    // the narrowest readable column will not fit -- not when the default one
    // will not.
    const wide = windowLeaving(WAVE_PANEL_MIN_COLUMN_WIDTH)
    expect(
      effectiveWavePanelMode({
        stored: 'compact',
        storedWidth: WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
        windowWidth: wide,
        reservedWidth: 260,
      }),
    ).toEqual({
      mode: 'compact',
      width: WAVE_PANEL_MIN_COLUMN_WIDTH,
      maxWidth: WAVE_PANEL_MIN_COLUMN_WIDTH,
    })
    // Mutation: compare `available` against the DEFAULT width -> red.
    expect(
      effectiveWavePanelMode({
        stored: 'compact',
        storedWidth: WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
        windowWidth: wide - 1,
        reservedWidth: 260,
      }),
    ).toEqual({ mode: 'strip', width: null, maxWidth: null })
  })

  it('MAR-3292 R1: a chosen fold is the strip at any width', () => {
    // Folded by choice and folded by width answer the SAME shape, so one
    // component renders both and no caller has to tell them apart by reading
    // a field that could disagree with the mode.
    // Mutation: fall through to the width arithmetic for `folded` -> a wide
    // window answers `compact` and the fold is un-choosable, red.
    for (const windowWidth of [320, 1024, 4000]) {
      expect(
        effectiveWavePanelMode({
          stored: 'folded',
          storedWidth: WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
          windowWidth,
          reservedWidth: 0,
        }),
      ).toEqual({ mode: 'strip', width: null, maxWidth: null })
    }
    // And it is the decision's answer, not the width's: the same window with
    // `compact` stored still gives a column.
    expect(
      effectiveWavePanelMode({
        stored: 'compact',
        storedWidth: WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
        windowWidth: 4000,
        reservedWidth: 0,
      }).mode,
    ).toBe('compact')
  })

  it('MAR-3189 R5: expanded is asked first and the window never refuses it', () => {
    // The expanded stack IS the main panel, so the arithmetic that starves
    // the column says nothing about it -- including in a window far too
    // narrow for any column at all.
    // Mutation: ask the width first -> the strip here, red.
    expect(
      effectiveWavePanelMode({
        stored: 'expanded',
        storedWidth: WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
        windowWidth: 320,
        reservedWidth: 260,
      }),
    ).toEqual({ mode: 'expanded', width: null, maxWidth: null })
    expect(
      effectiveWavePanelMode({
        stored: 'expanded',
        storedWidth: WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
        windowWidth: 4000,
        reservedWidth: 0,
      }),
    ).toEqual({ mode: 'expanded', width: null, maxWidth: null })
  })

  it('MAR-3155 R1: the width is the preference, cut to what the window can spare', () => {
    const at = (storedWidth: number, available: number) =>
      effectiveWavePanelMode({
        stored: 'compact',
        storedWidth,
        windowWidth: windowLeaving(available),
        reservedWidth: 260,
      })

    // A preference wider than the room: honoured as far as it fits.
    // Mutation: clamp to MAX alone (forget `available`) -> 380 here, red.
    expect(at(380, 320)).toEqual({
      mode: 'compact',
      width: 320,
      // Lap 2, B: the ceiling the decision used, for the handle to announce.
      // Mutation: return the constant -> 400 here, red.
      maxWidth: 320,
    })
    expect(at(380, 900).maxWidth).toBe(WAVE_PANEL_MAX_COLUMN_WIDTH)
    // The same preference where it does fit.
    expect(at(380, 900).width).toBe(380)
    // Never past the ceiling, however much room there is.
    expect(at(5_000, 5_000).width).toBe(WAVE_PANEL_MAX_COLUMN_WIDTH)
    // Never below the floor, however small the preference.
    expect(at(100, 900).width).toBe(WAVE_PANEL_MIN_COLUMN_WIDTH)
    // And a window that cannot hold the floor shows no column at all.
    expect(at(380, WAVE_PANEL_MIN_COLUMN_WIDTH - 1)).toEqual({
      mode: 'strip',
      width: null,
      maxWidth: null,
    })
  })

  it('MAR-3155 R1: the clamp honours a preference as far as the room allows', () => {
    // The decision's own arithmetic, alone: a ceiling below the floor is the
    // window telling the column it cannot fit, and the FLOOR wins -- the
    // decision has already refused anything narrower than that by then.
    expect(clampWavePanelWidth(400, 900)).toBe(400)
    expect(clampWavePanelWidth(900, 400)).toBe(400)
    // The law's ceiling, whatever the caller asks for (MAR-3189 R4).
    // Mutation: honour `max` alone -> 900 here, red.
    expect(clampWavePanelWidth(900, 900)).toBe(WAVE_PANEL_MAX_COLUMN_WIDTH)
    expect(clampWavePanelWidth(10, 900)).toBe(WAVE_PANEL_MIN_COLUMN_WIDTH)
    expect(clampWavePanelWidth(400, 10)).toBe(WAVE_PANEL_MIN_COLUMN_WIDTH)
  })

  it.each([
    {
      name: 'dragged wider against the ceiling',
      stored: 600,
      max: 400,
      requested: 900,
      expected: null,
    },
    {
      name: 'one pixel over the ceiling',
      stored: 600,
      max: 400,
      requested: 401,
      expected: null,
    },
    {
      name: 'default preference, dragged to the ceiling',
      stored: 280,
      max: 400,
      requested: 900,
      expected: 400,
    },
    {
      name: 'preference cut, then narrowed below the ceiling',
      stored: 600,
      max: 400,
      requested: 384,
      expected: 384,
    },
    {
      name: 'the ceiling moved: release below the preference',
      stored: 380,
      max: 900,
      requested: 300,
      expected: 300,
    },
    {
      name: 'a real choice away from the preference (the decision never sees a draft)',
      stored: 280,
      max: 400,
      requested: 380,
      expected: 380,
    },
    {
      name: 'requested below the floor → the floor',
      // The preference has to sit ABOVE the floor for this case to say
      // anything: with MAR-3189's 280 floor, a 280 preference and a
      // below-floor drag show the same width, which is the case below.
      stored: 400,
      max: 400,
      requested: 10,
      expected: WAVE_PANEL_MIN_COLUMN_WIDTH,
    },
    {
      name: 'preference already shows the floor → null',
      stored: WAVE_PANEL_MIN_COLUMN_WIDTH,
      max: 400,
      requested: 10,
      expected: null,
    },
    {
      name: 'a fractional requested → an integer',
      stored: 280,
      max: 400,
      requested: 341.7,
      expected: 342,
    },
  ] as const)('MAR-3161 R1: $name', ({ stored, max, requested, expected }) => {
    // Mutation: compare result with storedWidth instead of fallback →
    // "dragged wider against the ceiling" stores 400 → red.
    expect(
      settleWavePanelGesture({
        requested,
        storedWidth: stored,
        maxWidth: max,
      }),
    ).toBe(expected)
  })

  it('MAR-3189 lap 2, D: the expanded stack is an opaque cover, never a hole', () => {
    // The class IS the mechanism here: absolutely placed over the content
    // area and opaque, so what it hides keeps its box. Mutation: drop
    // `absolute inset-0` (or make the background translucent) -> red, and the
    // conversation underneath is either visible through Loom or gone from
    // the layout entirely.
    expect(LOOM_EXPANDED_CLASS).toContain('absolute')
    expect(LOOM_EXPANDED_CLASS).toContain('inset-0')
    expect(LOOM_EXPANDED_CLASS).toContain('bg-background')
    expect(LOOM_EXPANDED_CLASS).not.toMatch(/bg-background\//)
  })

  it('MAR-3155 R6: the compact class carries no width of its own', () => {
    // Inherited from `WAVE_PANEL_COLUMN_CLASS`, which went with the column
    // (MAR-3189 lap 2, G): the rule is about whichever class dresses the
    // panel beside the conversation, and that is Loom's compact stack now.
    // The width is the decision's number, rendered inline; a class saying
    // `w-[280px]` would be a second encoding of it, and the rendered test
    // asserts the inline width IS the decision's.
    // Mutation: put `w-[280px]` back in the class -> red.
    expect(LOOM_COMPACT_CLASS).not.toMatch(/\bw-\[/)
  })
})

describe('MAR-3138 R4: a blocked row waits on a decision, whatever its state', () => {
  it.each([
    ['done', true],
    ['unassigned', true],
    ['working', false],
    ['returned', false],
    ['stopped', false],
    ['reviewed', false],
    ['assigned', false],
  ] as const)('lap 2, A: %s is terminal -> %s', (state, terminal) => {
    // The two the ledger stops writing rows for, and no others: a
    // `stopped` lap is parked, not over, and still asks to be re-groomed.
    expect(isTerminalWaveRow({ state })).toBe(terminal)
  })

  it.each([
    ['working', 'working' as const],
    ['returned', 'returned' as const],
    ['stopped', 'stopped' as const],
    ['assigned', 'assigned' as const],
  ])('a blocked %s row sits under Waiting on you, once', (_name, state) => {
    const sections = sectionWaveRows(
      [ledgerEntry({ issueIdentifier: 'EX-1', state, blocked: true })],
      NOW,
    )

    // Mutation: leave a blocked row in its state's section -> red.
    expect(ids(sections.waitingOnYou)).toEqual(['EX-1'])
    expect(sections.waitingOnYou[0]!.action).toBe('decide')
    expect(ids(sections.inTheWave)).toEqual([])
    expect(ids(sections.waitingToStart)).toEqual([])
    // Still in its wave group, exactly once.
    expect(sections.waves.map((group) => ids(group.rows))).toEqual([['EX-1']])
    expect(sections.waitingOnYou.length).toBe(1)
    expect(waveBoardLine(sections)).toBe('1 issue · 1 waiting on you')
  })

  it.each([
    ['done', 'done' as const],
    ['unassigned', 'unassigned' as const],
  ])(
    'lap 2, A: a blocked %s row is terminal -- Waves only, and it asks for nothing',
    (_name, state) => {
      const entry = ledgerEntry({
        issueIdentifier: 'EX-1',
        state,
        blocked: true,
      })
      const sections = sectionWaveRows([entry], NOW)

      // The loop has let this issue go: `diffTrackerSnapshot` writes no
      // further row for it and the tracker query no longer returns it, so an
      // ask here could never be answered -- not even by removing the label.
      // Mutation: drop the terminal guard in `sectionWaveRows` -> the row is
      // under Waiting on you, red.
      expect(ids(sections.waitingOnYou)).toEqual([])
      expect(ids(sections.inTheWave)).toEqual([])
      expect(ids(sections.waitingToStart)).toEqual([])
      expect(sections.waitingOnYou.length).toBe(0)
      expect(waveBoardLine(sections)).toBe('1 issue · 0 waiting on you')
      // It is still on the board, with its wave and its facts.
      expect(sections.waves.map((group) => ids(group.rows))).toEqual([['EX-1']])
      expect(sections.waves[0]!.rows[0]!.entry.blocked).toBe(true)
      // Mutation: drop the terminal guard in `waveRowAction` -> "decide", red.
      expect(sections.waves[0]!.rows[0]!.action).toBeNull()
      expect(waveRowAction(entry)).toBeNull()
    },
  )

  it('a blocked reviewed row appears under Waiting on you once, not twice', () => {
    const sections = sectionWaveRows(
      [
        ledgerEntry({
          issueIdentifier: 'EX-1',
          state: 'reviewed',
          blocked: true,
        }),
      ],
      NOW,
    )
    // Mutation: push a blocked row in its own `if` before the state chain ->
    // two rows here, red.
    expect(ids(sections.waitingOnYou)).toEqual(['EX-1'])
    // Decide outranks QA: the issue cannot be checked until it is decided.
    expect(sections.waitingOnYou[0]!.action).toBe('decide')
  })

  it('"decide" outranks every state’s action, and only while the label is on', () => {
    const blocked = (overrides: Partial<WorkLedgerEntry>) =>
      waveRowAction(
        ledgerEntry({ issueIdentifier: 'EX-9', blocked: true, ...overrides }),
      )
    // Mutation: ask the state first -> each of these reads its state's word.
    expect(blocked({ state: 'reviewed' })).toBe('decide')
    expect(blocked({ state: 'returned' })).toBe('decide')
    expect(blocked({ state: 'stopped' })).toBe('decide')
    expect(blocked({ state: 'working', sessionId: null })).toBe('decide')
    expect(blocked({ state: 'assigned' })).toBe('decide')
    expect(
      waveRowAction(
        ledgerEntry({ issueIdentifier: 'EX-9', state: 'assigned' }),
      ),
    ).toBeNull()
    // ...and never past the end of the line (lap 2, A).
    expect(blocked({ state: 'done' })).toBeNull()
    expect(blocked({ state: 'unassigned', seat: null })).toBeNull()
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
    expect(sections.inTheWave.length).toBe(1)
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
