import { describe, expect, it } from 'vitest'
import type { WorkLedgerState } from '@/entities/work-ledger'
import {
  loomNowRows,
  loomSubline,
  loomSheetCounts,
  loomSheetNote,
  loomSheets,
  loomSheetSize,
  loomSheetTitle,
  type LoomSheets,
} from './loom-sheets.pure'
import { LOOM_SHEETS } from './wave-panel-sheet.pure'
import { ledgerEntry } from './wave-rows.fixture'

const NOW = Date.parse('2026-09-18T12:10:00.000Z')

const STATES: readonly WorkLedgerState[] = [
  'assigned',
  'working',
  'returned',
  'reviewed',
  'done',
  'unassigned',
  'stopped',
]

/** Which list a row belongs in, written out rather than derived from the code. */
type Bucket =
  | 'before'
  | 'now.inFlight'
  | 'now.awaitingQa'
  | 'now.fablesTurn'
  | 'now.decide'
  | 'next'
  | 'plan'

function expectedBucket(
  state: WorkLedgerState,
  seated: boolean,
  blocked: boolean,
): Bucket {
  if (state === 'done') return 'before'
  if (blocked) return 'now.decide'
  if (state === 'working') return 'now.inFlight'
  if (state === 'reviewed') return 'now.awaitingQa'
  if (state === 'returned') return 'now.fablesTurn'
  if (state === 'assigned') return seated ? 'next' : 'plan'
  return 'plan'
}

function listsOf(sheets: LoomSheets): Record<Bucket, readonly string[]> {
  const ids = (rows: LoomSheets['before']) =>
    rows.map((row) => row.entry.issueIdentifier)
  return {
    before: ids(sheets.before),
    'now.inFlight': ids(sheets.now.inFlight),
    'now.awaitingQa': ids(sheets.now.awaitingQa),
    'now.fablesTurn': ids(sheets.now.fablesTurn),
    'now.decide': ids(sheets.now.decide),
    next: ids(sheets.next),
    plan: ids(sheets.plan),
  }
}

/** Every state × seat/no seat × blocked, each as its own identifiable row. */
const CASES = STATES.flatMap((state) =>
  [true, false].flatMap((seated) =>
    [true, false].map((blocked) => ({
      state,
      seated,
      blocked,
      id: `EX-${state}-${seated ? 'seat' : 'noseat'}-${blocked ? 'blocked' : 'free'}`,
    })),
  ),
)

const ROWS = CASES.map((c) =>
  ledgerEntry({
    issueIdentifier: c.id,
    state: c.state,
    seat: c.seated ? 'opus-mac' : null,
    blocked: c.blocked,
  }),
)

describe('MAR-3189 R2: every row lands in exactly one sheet, by the ledger state', () => {
  it('the whole table, and the union is the input', () => {
    const lists = listsOf(loomSheets(ROWS, NOW))

    for (const c of CASES) {
      const home = expectedBucket(c.state, c.seated, c.blocked)
      // Mutation: `reviewed -> before` -> red (Reviewed stays in Now,
      // awaiting acceptance). Mutation: ignore `blocked` -> red on every
      // blocked live row.
      expect(lists[home], `${c.id} belongs in ${home}`).toContain(c.id)
      for (const other of Object.keys(lists) as Bucket[]) {
        if (other === home) continue
        expect(lists[other], `${c.id} must not be in ${other}`).not.toContain(
          c.id,
        )
      }
    }

    // No row invented, none dropped. Mutation: drop the final `else` that
    // sends `unassigned`/`stopped` to Plan -> red, four rows short.
    const seen = Object.values(lists).flat()
    expect([...seen].sort()).toEqual([...CASES.map((c) => c.id)].sort())
  })

  it('lap 2, E: a row in Decide always says what to do', () => {
    const sheets = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'EX-1',
          state: 'unassigned',
          seat: null,
          blocked: true,
        }),
      ],
      NOW,
    )
    // `waveRowAction` calls an `unassigned` row terminal and gives it no
    // verb. In the old sections that row sat in *Waves* asking nothing; in
    // Decide it would be a row under a heading that promises somebody owes it
    // a decision, saying nothing at all. Mutation: leave the action null ->
    // red. `waveRowAction` itself is untouched (R6).
    expect(sheets.now.decide.map((row) => row.entry.issueIdentifier)).toEqual([
      'EX-1',
    ])
    expect(sheets.now.decide[0]?.action).toBe('decide')
  })

  it('a blocked row that is done is history, not a decision', () => {
    const sheets = loomSheets(
      [ledgerEntry({ issueIdentifier: 'EX-1', state: 'done', blocked: true })],
      NOW,
    )
    // Mutation: ask `blocked` before `done` -> red. The loop has let go of a
    // done issue; a label left on it is not a question anybody can answer.
    expect(sheets.before.map((row) => row.entry.issueIdentifier)).toEqual([
      'EX-1',
    ])
    expect(sheets.now.decide).toEqual([])
  })

  it('assigned splits on the seat: Next is queued at a horse, Plan is not', () => {
    const sheets = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'EX-SEAT',
          state: 'assigned',
          seat: 'astra-mac',
        }),
        ledgerEntry({
          issueIdentifier: 'EX-NONE',
          state: 'assigned',
          seat: null,
        }),
      ],
      NOW,
    )
    // Mutation: send every `assigned` row to Next -> red.
    expect(sheets.next.map((row) => row.entry.issueIdentifier)).toEqual([
      'EX-SEAT',
    ])
    expect(sheets.plan.map((row) => row.entry.issueIdentifier)).toEqual([
      'EX-NONE',
    ])
  })

  it('the row carries the words it already speaks', () => {
    const sheets = loomSheets(
      [
        ledgerEntry({ issueIdentifier: 'EX-1', state: 'reviewed', lap: 3 }),
        ledgerEntry({ issueIdentifier: 'EX-2', state: 'stopped' }),
      ],
      NOW,
      () => ({ name: 'convergence development', cap: null }),
    )
    // The sheets re-derive nothing: the action, the lap and the crew are the
    // same functions the old sections use. Mutation: hard-code `action: null`
    // -> red.
    expect(sheets.now.awaitingQa[0]?.action).toBe('QA and say done')
    expect(sheets.now.awaitingQa[0]?.lapLabel).toBe('lap 3')
    expect(sheets.now.awaitingQa[0]?.crewName).toBe('convergence development')
    expect(sheets.plan[0]?.action).toBe('re-groom (Fable)')
  })
})

describe('MAR-3189: the titles say what their numbers mean', () => {
  const sheets = loomSheets(
    [
      ledgerEntry({ issueIdentifier: 'EX-1', state: 'done' }),
      ledgerEntry({ issueIdentifier: 'EX-2', state: 'done' }),
      ledgerEntry({ issueIdentifier: 'EX-3', state: 'working' }),
      ledgerEntry({ issueIdentifier: 'EX-4', state: 'returned' }),
      ledgerEntry({ issueIdentifier: 'EX-5', state: 'working', blocked: true }),
      ledgerEntry({ issueIdentifier: 'EX-6', state: 'reviewed' }),
      ledgerEntry({ issueIdentifier: 'EX-7', state: 'assigned', seat: 'opus' }),
    ],
    NOW,
  )
  const counts = loomSheetCounts(sheets, NOW)

  it('Now’s two numbers cover all four of its groups', () => {
    // A title that counted only `now.inFlight` would read "1 open" while the
    // sheet held four rows -- a number above the rows that lies about them.
    // Mutation: `open: sheets.now.inFlight.length` -> red.
    expect(counts.open).toBe(3)
    expect(counts.awaitingQa).toBe(1)
    expect(counts.open + counts.awaitingQa).toBe(loomSheetSize(sheets, 'now'))
  })

  it('each title names its own unit', () => {
    expect(loomSheetTitle('before', counts)).toBe('Before · 2 done')
    expect(loomSheetTitle('now', counts)).toBe('Now · 3 open · 1 awaiting QA')
    expect(loomSheetTitle('next', counts)).toBe('Next · 1 queued')
    expect(loomSheetTitle('plan', counts)).toBe('Plan · 0 in preparation')
    // Mutation: one title for all four sheets -> red; the words are the
    // difference between four counts and four unexplained numbers.
    expect(
      new Set(LOOM_SHEETS.map((s) => loomSheetTitle(s, counts))).size,
    ).toBe(4)
  })

  it('lap 2, F: the Now title names what it counts', () => {
    // My own brief said "in flight", and it counted a returned row waiting on
    // a verdict and a blocked one waiting on a decision -- neither is in
    // flight. Mutation: count only `now.inFlight` -> `Now · 1 open · 2
    // awaiting QA` here, red.
    const mixed = loomSheets(
      [
        ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' }),
        ledgerEntry({ issueIdentifier: 'EX-2', state: 'returned' }),
        ledgerEntry({
          issueIdentifier: 'EX-3',
          state: 'working',
          blocked: true,
        }),
        ledgerEntry({ issueIdentifier: 'EX-4', state: 'reviewed' }),
        ledgerEntry({ issueIdentifier: 'EX-5', state: 'reviewed' }),
      ],
      NOW,
    )
    expect(loomSheetTitle('now', loomSheetCounts(mixed, NOW))).toBe(
      'Now · 3 open · 2 awaiting QA',
    )
  })

  it('an empty sheet says it is empty, in its own name', () => {
    // MAR-3194: Plan's old apology ("needs the wider read") went out with
    // LV1. An empty Plan now says what every other empty sheet says.
    expect(loomSheetNote('plan', loomSheets([], NOW), NOW)).toBe(
      'Nothing in Plan right now.',
    )
    expect(loomSheetNote('now', sheets, NOW)).toBeNull()
    expect(loomSheetNote('next', sheets, NOW)).toBeNull()
    expect(loomSheetNote('before', loomSheets([], NOW), NOW)).toBe(
      'Nothing in Before right now.',
    )
  })
})

describe('MAR-3189: the subline names the ledger on screen', () => {
  it('one crew by name, several by count, none at all still says what is shown', () => {
    // r4 asks for the tracker PROJECT's name, which a binding does not carry
    // (`projectId` only), so the crew's name stands in -- the same word the
    // outage header uses. Mutation: name the first crew when several are
    // bound -> the line claims one ledger while showing two, red.
    expect(loomSubline(['convergence development'])).toBe(
      'convergence development · All waves',
    )
    expect(loomSubline(['convergence development', 'night shift'])).toBe(
      '2 crews · All waves',
    )
    expect(loomSubline([])).toBe('All waves')
  })
})

describe('MAR-3191 R4: Now lists only the rows no card holds', () => {
  const sheets = loomSheets(
    [
      ledgerEntry({ issueIdentifier: 'EX-1', state: 'working', seat: 'opus' }),
      ledgerEntry({ issueIdentifier: 'EX-2', state: 'working', seat: 'astra' }),
    ],
    NOW,
  )

  it('removes a held row and keeps the rest, by crew AND issue', () => {
    const held = sheets.now.inFlight[0]!
    // Mutation: list the held rows too -> EX-1 appears on the card and in the
    // list, twice on one sheet.
    expect(
      loomNowRows(sheets, [{ held }]).map((row) => row.entry.issueIdentifier),
    ).toEqual(['EX-2'])
    // A card with nothing in hand removes nothing.
    expect(loomNowRows(sheets, [{ held: null }])).toHaveLength(2)
    expect(loomNowRows(sheets, [])).toHaveLength(2)
  })

  it('a row of another crew with the same issue id is not removed', () => {
    // Mutation: key the removal on `issueId` alone -> the other crew's row
    // disappears from a sheet nobody is showing it on, red.
    const other = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'EX-1',
          state: 'working',
          seat: 'opus',
          crewId: 'crew-2',
        }),
      ],
      NOW,
    )
    expect(
      loomNowRows(other, [{ held: sheets.now.inFlight[0]! }]),
    ).toHaveLength(1)
  })
})

describe('MAR-3191 lap 2, A: one row lives in exactly one group', () => {
  it('a blocked working row is in Decide and never in the in-flight list', () => {
    // This is the structural guarantee `loomNowRows` leans on instead of a
    // `heldFrom` guard: the guard could not fire, because a row the card
    // took from Decide is not in this list at all.
    // Mutation: `loomSheets` pushing a blocked row to BOTH groups -> the
    // union assertion in `loom-horses.pure.test.ts` goes red first.
    const sheets = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'EX-1',
          state: 'working',
          seat: 'opus',
          blocked: true,
        }),
      ],
      NOW,
    )
    expect(sheets.now.inFlight).toEqual([])
    expect(sheets.now.decide).toHaveLength(1)
    const held = sheets.now.decide[0]!
    expect(loomNowRows(sheets, [{ held }])).toEqual([])
  })
})
