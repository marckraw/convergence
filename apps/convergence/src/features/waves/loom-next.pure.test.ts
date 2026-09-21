import type { DispatchWord } from '@/shared/types/tracker.types'
import { dispatchWordSentence } from './loom-next.pure'
import { describe, expect, it } from 'vitest'
import {
  loomMissingLabels,
  loomNext,
  loomQueueCompare,
  loomSeatCapacity,
  LOOM_NEXT_ORDER_LINE,
  LOOM_NEXT_UNSEATED_TITLE,
} from './loom-next.pure'
import type { LoomHorse } from './loom-horses.pure'
import { loomSheetCounts, loomSheets, loomSheetTitle } from './loom-sheets.pure'
import { ledgerEntry } from './wave-rows.fixture'
import {
  waveLapLabel,
  waveRowAction,
  waveRowHostMarker,
  type WaveRow,
} from './wave-sections.pure'
import type { WorkLedgerEntry } from '@/entities/work-ledger'

/** The instant this file calls "now"; written down, never inherited. */
const NOW = Date.parse('2026-09-19T12:00:00.000Z')

const READY = { groomed: true, grounded: true, dispatch: true }

interface QueuedOptions {
  seat?: string | null
  sessionId?: string | null
  crewId?: string
  priority?: number | null
  facts?: Record<string, boolean>
}

const queuedEntry = (
  identifier: string,
  {
    seat = 'opus',
    sessionId = 'session-opus',
    crewId = 'crew-1',
    priority = null,
    facts = READY,
  }: QueuedOptions = {},
): WorkLedgerEntry =>
  ledgerEntry({
    issueIdentifier: identifier,
    state: 'assigned',
    seat,
    sessionId,
    crewId,
    fact: {
      logicalStatus: null,
      branchName: null,
      updatedAt: null,
      priority,
      ...facts,
    },
  })

const row = (entry: WorkLedgerEntry): WaveRow => ({
  entry,
  action: waveRowAction(entry),
  hostMarker: waveRowHostMarker(entry, NOW),
  crewName: null,
  lapLabel: waveLapLabel(entry.lap, null),
})

const queued = (identifier: string, options: QueuedOptions = {}): WaveRow =>
  row(queuedEntry(identifier, options))

const horse = (overrides: Partial<LoomHorse> = {}): LoomHorse => ({
  key: 'crew-1:opus',
  crewId: 'crew-1',
  crewName: null,
  seat: 'opus',
  kind: 'resident',
  runtime: 'idle',
  hostLabel: 'This Mac',
  hostMarker: null,
  sessionId: 'session-opus',
  openable: true,
  held: null,
  heldFrom: null,
  conversationMissing: false,
  returned: null,
  ...overrides,
})

const identifiers = (rows: readonly WaveRow[]) =>
  rows.map((each) => each.entry.issueIdentifier)

describe('MAR-3193 R1: a row is in the queue of the horse it belongs to', () => {
  it('two seats and a stray: every row lands in exactly one place', () => {
    const rows = [
      queued('MAR-1', { seat: 'opus', sessionId: 'session-opus' }),
      queued('MAR-2', { seat: 'astra', sessionId: null }),
      queued('MAR-3', { seat: 'ghost', sessionId: null }),
    ]
    const next = loomNext(rows, [
      horse(),
      horse({
        key: 'crew-1:astra',
        seat: 'astra',
        sessionId: null,
        kind: 'dynamic',
      }),
    ])

    expect(next.seats.map((seat) => seat.title)).toEqual(['opus', 'astra'])
    expect(identifiers(next.seats[0]!.ready)).toEqual(['MAR-1'])
    expect(identifiers(next.seats[1]!.ready)).toEqual(['MAR-2'])
    expect(identifiers(next.unseated)).toEqual(['MAR-3'])
    // The union is the input, and nothing is drawn twice.
    const placed = [
      ...next.seats.flatMap((seat) => [...seat.ready, ...seat.preparing]),
      ...next.unseated,
    ]
    expect(identifiers(placed).sort()).toEqual(['MAR-1', 'MAR-2', 'MAR-3'])
  })

  it('a same-named seat in another crew does not steal the row', () => {
    // Mutation: group on the seat NAME and drop the crew check -> crew-2's
    // horse claims crew-1's row, red.
    const mine = queued('MAR-1', { crewId: 'crew-1' })
    const next = loomNext(
      [mine],
      [horse({ key: 'crew-2:opus', crewId: 'crew-2' })],
    )
    expect(next.seats).toEqual([])
    expect(identifiers(next.unseated)).toEqual(['MAR-1'])
  })

  it('a seat with nothing queued is not drawn at all', () => {
    const next = loomNext(
      [queued('MAR-1')],
      [horse(), horse({ key: 'crew-1:astra', seat: 'astra', sessionId: null })],
    )
    expect(next.seats.map((seat) => seat.key)).toEqual(['crew-1:opus'])
  })

  it('a stray row says whose seat the label named', () => {
    const next = loomNext([queued('MAR-9', { seat: 'ghost' })], [])
    expect(next.unseated[0]?.action).toBe('seat "ghost" not in the crew')
    expect(LOOM_NEXT_UNSEATED_TITLE).toBe('No seat named in this crew')
  })
})

describe('MAR-3193 lap 2, A: a seat can outlive its conversation', () => {
  /**
   * The backend nulls `entry.sessionId` when the seat's conversation is gone
   * (`workLedgerEntryFromJoinedRow`) while the crew member keeps its id, so
   * the conversation join refuses a row that plainly belongs to this horse.
   */
  const orphaned = (identifier: string, facts = READY) =>
    queued(identifier, { seat: 'opus-mac', sessionId: null, facts })

  const gone = horse({
    key: 'crew-1:opus-mac',
    seat: 'opus-mac',
    sessionId: 's1',
    conversationMissing: true,
  })

  it('the row is that seat’s, and says what is actually wrong', () => {
    const next = loomNext([orphaned('MAR-1')], [gone])
    expect(next.seats).toHaveLength(1)
    expect(next.unseated).toEqual([])
    expect(identifiers(next.seats[0]!.preparing)).toEqual(['MAR-1'])
    // The lap's bug: this read `seat "opus-mac" not in the crew`, which was
    // false -- the seat is in the crew, its conversation is not.
    expect(next.seats[0]!.preparing[0]?.action).toBe('seat has no conversation')
    expect(next.seats[0]!.ready).toEqual([])
  })

  it('a fully-labelled row in that state is still not ready', () => {
    // Mutation: let the fallback row fall through to the label check -> it
    // reads `1 · ready`, red. Nothing runs through a door that is gone.
    const next = loomNext([orphaned('MAR-1', READY)], [gone])
    expect(next.ready).toBe(0)
    expect(next.preparing).toBe(1)
    expect(next.seats[0]!.ready).toEqual([])
  })

  it('it counts in the capacity line and in the title', () => {
    const sheets = loomSheets(
      [
        queuedEntry('MAR-1', { seat: 'opus-mac', sessionId: null }),
        queuedEntry('MAR-2', { seat: 'opus-mac', sessionId: null }),
      ],
      NOW,
    )
    const next = loomNext(sheets.next, [gone])
    expect(next.seats[0]?.capacity).toBe('This Mac · Idle · 2 queued')
    expect(loomSheetTitle('next', loomSheetCounts(sheets, NOW, [gone]))).toBe(
      'Next · 0 ready · 2 preparing',
    )
  })

  it('the crew is still half the match', () => {
    // Mutation: drop the `crewId` half of the fallback -> a same-named seat
    // in another crew takes the row, red.
    const next = loomNext(
      [orphaned('MAR-1')],
      [horse({ key: 'crew-2:opus-mac', crewId: 'crew-2', seat: 'opus-mac' })],
    )
    expect(next.seats).toEqual([])
    expect(next.unseated[0]?.action).toBe('seat "opus-mac" not in the crew')
  })

  it('a name matching no horse still says nobody is named', () => {
    const next = loomNext([queued('MAR-9', { seat: 'ghost' })], [gone])
    expect(next.seats).toEqual([])
    expect(next.unseated[0]?.action).toBe('seat "ghost" not in the crew')
  })
})

describe('MAR-3193 R2: Ready means it could run; Preparing says what is missing', () => {
  it('all eight label combinations', () => {
    const flags = [false, true]
    const seen: string[] = []
    for (const groomed of flags) {
      for (const grounded of flags) {
        for (const dispatch of flags) {
          const next = loomNext(
            [queued('MAR-1', { facts: { groomed, grounded, dispatch } })],
            [horse()],
          )
          const seat = next.seats[0]!
          const isReady = groomed && grounded && dispatch
          expect(seat.ready).toHaveLength(isReady ? 1 : 0)
          expect(seat.preparing).toHaveLength(isReady ? 0 : 1)
          seen.push(String(seat.ready[0]?.action ?? seat.preparing[0]?.action))
        }
      }
    }
    expect(seen).toEqual([
      'needs groomed · grounded · dispatch',
      'needs groomed · grounded',
      'needs groomed · dispatch',
      'needs groomed',
      'needs grounded · dispatch',
      'needs grounded',
      'needs dispatch',
      '1 · ready',
    ])
  })

  it('a row written before the labels were read is not Ready', () => {
    // Mutation: `!== false` instead of `=== true` -> a pre-MAR-3190 row,
    // whose keys are ABSENT, reads Ready, red.
    const next = loomNext([queued('MAR-1', { facts: {} })], [horse()])
    expect(next.seats[0]?.ready).toEqual([])
    expect(next.seats[0]?.preparing[0]?.action).toBe(
      'needs groomed · grounded · dispatch',
    )
    expect(loomMissingLabels({})).toEqual(['groomed', 'grounded', 'dispatch'])
    expect(loomMissingLabels(READY)).toEqual([])
  })

  it('the shared row is copied, never rewritten', () => {
    const original = queued('MAR-1', { facts: {} })
    const before = original.action
    loomNext([original], [horse()])
    expect(original.action).toBe(before)
  })
})

describe('MAR-3193 R3: the order is named, and is one function', () => {
  it('priority first, none last, then the issue number', () => {
    const rows = [
      queued('MAR-10', { priority: 2 }),
      queued('MAR-11', { priority: null }),
      queued('MAR-12', { priority: 1 }),
      queued('MAR-13', { priority: 0 }),
      queued('MAR-14', { priority: 4 }),
    ]
    // Mutation: sort null/0 first -> red.
    expect(identifiers([...rows].sort(loomQueueCompare))).toEqual([
      'MAR-12',
      'MAR-10',
      'MAR-14',
      'MAR-11',
      'MAR-13',
    ])
  })

  it('a tie is broken by the NUMBER, not the text', () => {
    const rows = [
      queued('MAR-1000', { priority: 2 }),
      queued('MAR-999', { priority: 2 }),
    ]
    // Mutation: compare the identifiers as text -> `MAR-1000` sorts first,
    // red.
    expect(identifiers([...rows].sort(loomQueueCompare))).toEqual([
      'MAR-999',
      'MAR-1000',
    ])
  })

  it('both halves of a queue use it, and Ready is numbered from one', () => {
    const next = loomNext(
      [
        queued('MAR-20', { priority: 3 }),
        queued('MAR-21', { priority: 1 }),
        queued('MAR-30', { priority: 3, facts: { groomed: true } }),
        queued('MAR-31', { priority: 1, facts: { groomed: true } }),
      ],
      [horse()],
    )
    const seat = next.seats[0]!
    expect(identifiers(seat.ready)).toEqual(['MAR-21', 'MAR-20'])
    expect(seat.ready.map((each) => each.action)).toEqual([
      '1 · ready',
      '2 · ready',
    ])
    expect(identifiers(seat.preparing)).toEqual(['MAR-31', 'MAR-30'])
  })

  it('the footer says the two facts the sort actually uses', () => {
    expect(LOOM_NEXT_ORDER_LINE).toBe(
      'Order: priority, then issue number · running work stays in Now',
    )
  })
})

describe('MAR-3193 R4: the capacity line says what the horse is doing', () => {
  it('one phrase per runtime, and the whole queue in the count', () => {
    const held = queued('MAR-77')
    const cases: [Partial<LoomHorse>, string][] = [
      [{ runtime: 'working', held }, 'This Mac · Working on MAR-77 · 2 queued'],
      [{ runtime: 'working', held: null }, 'This Mac · Working · 2 queued'],
      [{ runtime: 'idle' }, 'This Mac · Idle · 2 queued'],
      [{ runtime: 'failed' }, 'This Mac · Last turn failed · 2 queued'],
      [{ runtime: 'not-seen' }, 'This Mac · Not seen yet · 2 queued'],
      // A seat with no host named drops the segment AND its separator.
      [{ hostLabel: null }, 'Idle · 2 queued'],
    ]
    for (const [overrides, line] of cases) {
      expect(loomSeatCapacity(horse(overrides), 2)).toBe(line)
    }
  })

  it('the count is Ready AND Preparing, on the drawn line', () => {
    const next = loomNext(
      [queued('MAR-1'), queued('MAR-2', { facts: { groomed: true } })],
      [horse()],
    )
    // Mutation: count Ready only -> `1 queued` over a group drawing two,
    // red.
    expect(next.seats[0]?.capacity).toBe('This Mac · Idle · 2 queued')
  })

  it('a seat nobody named falls back to its key, and says no Paused', () => {
    const next = loomNext(
      [queued('MAR-1', { seat: null, sessionId: 'session-opus' })],
      [horse({ seat: null })],
    )
    expect(next.seats[0]?.title).toBe('crew-1:opus')
    expect(next.seats[0]?.capacity).not.toContain('Paused')
  })
})

describe('MAR-3193 R5: the title counts from the same derivation', () => {
  it('two ready and three preparing: the title says both', () => {
    const entries = [
      queuedEntry('MAR-1'),
      queuedEntry('MAR-2'),
      queuedEntry('MAR-3', { facts: { groomed: true } }),
      queuedEntry('MAR-4', { facts: {} }),
      queuedEntry('MAR-5', { seat: 'ghost', sessionId: null }),
    ]
    const sheets = loomSheets(entries, NOW)
    // The partition is untouched: Next still holds all five rows.
    expect(sheets.plan).toHaveLength(0)
    expect(sheets.next).toHaveLength(5)

    const counts = loomSheetCounts(sheets, NOW, [horse()])
    // Mutation: N from `sheets.next.length` -> `Next · 5 ready`, red.
    expect(loomSheetTitle('next', counts)).toBe('Next · 2 ready · 3 preparing')
    // The strip's number keeps meaning "how much is in this sheet".
    expect(counts.next).toBe(5)
    expect(counts.nextReady + counts.nextPreparing).toBe(counts.next)
  })

  it('nothing preparing: the title says one number', () => {
    const sheets = loomSheets([queuedEntry('MAR-1')], NOW)
    expect(
      loomSheetTitle('next', loomSheetCounts(sheets, NOW, [horse()])),
    ).toBe('Next · 1 ready')
  })
})

describe('MAR-3293 backend dispatch plan', () => {
  it('R8 uses the supplied order and words instead of the legacy issue-number order', () => {
    const rows = [queued('MAR-1'), queued('MAR-2'), queued('MAR-3')]
    const plan = {
      plannedAt: '2026-09-21T12:00:00Z',
      warnings: [],
      order: { opus: ['issue-MAR-2', 'issue-MAR-1', 'issue-MAR-3'] },
      words: {
        'issue-MAR-2': {
          kind: 'would-start' as const,
          wire: { id: 'w', opener: null },
        },
        'issue-MAR-1': { kind: 'queued-behind' as const, identifier: 'MAR-2' },
        'issue-MAR-3': {
          kind: 'lane' as const,
          state: 'dirty' as const,
          path: null,
        },
      },
    }
    const next = loomNext(rows, [horse()], plan)
    expect(identifiers(next.seats[0].ready)).toEqual(['MAR-2', 'MAR-1'])
    expect(next.seats[0].ready.map((r) => r.action)).toEqual([
      'would start now',
      'queued behind MAR-2',
    ])
    expect(next.seats[0].preparing[0].action).toBe(
      'lane has uncommitted changes',
    )
    const counts = loomSheetCounts(
      loomSheets(
        rows.map((r) => r.entry),
        NOW,
      ),
      NOW,
      [horse()],
      plan,
    )
    expect([counts.nextReady, counts.nextPreparing, counts.next]).toEqual([
      2, 1, 3,
    ])
  })
})

it.each<[DispatchWord, string]>([
  [
    { kind: 'needs-labels', missing: ['grounded', 'dispatch'] },
    'needs grounded · dispatch',
  ],
  [{ kind: 'blocked' }, 'blocked'],
  [{ kind: 'seat-not-in-crew' }, 'seat "opus" not in the crew'],
  [{ kind: 'seat-no-conversation' }, 'seat has no conversation'],
  [{ kind: 'no-mastermind' }, 'no mastermind seat in this crew'],
  [{ kind: 'no-wire' }, 'no wire from the mastermind to this seat'],
  [{ kind: 'seat-busy', why: 'turn' }, 'seat busy · turn running'],
  [{ kind: 'seat-busy', why: 'compacting' }, 'seat busy · compacting'],
  [{ kind: 'seat-busy', why: 'drill' }, 'seat busy · drill running'],
  [{ kind: 'seat-busy', why: 'waiting-on-you' }, 'seat busy · waiting on you'],
  [
    { kind: 'seat-holds', identifier: 'MAR-2' },
    'MAR-2 is still with this seat',
  ],
  [
    { kind: 'lane', state: 'dirty', path: null },
    'lane has uncommitted changes',
  ],
  [
    { kind: 'lane', state: 'unpushed', path: null },
    'lane has unpushed commits',
  ],
  [{ kind: 'lane', state: 'unknown', path: null }, 'lane not checked'],
  [{ kind: 'queued-behind', identifier: 'MAR-2' }, 'queued behind MAR-2'],
  [{ kind: 'would-start', wire: { id: 'w', opener: null } }, 'would start now'],
])('R8 translates %j into the specified sentence', (word, sentence) => {
  expect(dispatchWordSentence(word, 'opus')).toBe(sentence)
})
