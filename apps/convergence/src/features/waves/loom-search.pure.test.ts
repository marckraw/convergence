import { describe, expect, it } from 'vitest'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import type {
  TrackerOutsideIssue,
  TrackerOutsideSnapshot,
} from '@/shared/types/tracker.types'
import {
  isLoomSearchShortcut,
  loomOutsideMatches,
  loomRowMatches,
  loomSearchElsewhereLabel,
  loomSearchElsewherePrefix,
  loomSearchHorses,
  loomSearchHorsesLine,
  loomSearchNowhereLine,
  loomSearchRows,
  loomSearchSummary,
  LOOM_SEARCH_NO_HORSE_LINE,
  LOOM_SEARCH_LEFT_TITLE,
  LOOM_SEARCH_OLDER_TITLE,
  normalizeLoomQuery,
} from './loom-search.pure'
import { loomSheets } from './loom-sheets.pure'
import { loomOutsideView, LOOM_OUTSIDE_MORE_LINE } from './loom-outside.pure'
import { LOOM_NO_HORSES_LINE, type LoomHorse } from './loom-horses.pure'
import { ledgerEntry } from './wave-rows.fixture'

/** Loom's search as pure functions (MAR-3234). */

const NOW = Date.parse('2026-09-19T12:00:00.000Z')

const entry = (
  identifier: string,
  title: string,
  overrides: Partial<WorkLedgerEntry> = {},
): WorkLedgerEntry =>
  ledgerEntry({ issueIdentifier: identifier, issueTitle: title, ...overrides })

const outsideIssue = (
  identifier: string,
  title: string,
): TrackerOutsideIssue => ({
  id: `id-${identifier}`,
  identifier,
  title,
  url: `https://linear.app/x/issue/${identifier.toLowerCase()}`,
  status: 'Backlog',
  priority: null,
  labels: [],
  updatedAt: '2026-09-19T09:00:00.000Z',
})

const snapshot = (
  issues: TrackerOutsideIssue[],
  more = false,
): TrackerOutsideSnapshot => ({
  crewId: 'crew-1',
  issues,
  more,
  readAt: '2026-09-19T11:55:00.000Z',
})

describe('R1: what matches', () => {
  it('normalizes: trimmed, and empty is no query', () => {
    expect(normalizeLoomQuery('  3233  ')).toBe('3233')
    expect(normalizeLoomQuery('   ')).toBeNull()
    expect(normalizeLoomQuery('')).toBeNull()
  })

  const ISSUES = [
    entry('MAR-3233', 'Retire the Waves tab'),
    entry('MAR-3200', 'Learn Loom umbrella'),
    entry('MAR-1320', 'Codex daemon probe'),
    entry('MAR-32', 'An old one'),
  ]
  const hits = (query: string) =>
    ISSUES.filter((row) => loomRowMatches(row, query)).map(
      (row) => row.issueIdentifier,
    )

  it.each([
    ['mar-3233', ['MAR-3233']],
    ['MAR-3233', ['MAR-3233']],
    ['3233', ['MAR-3233']],
    ['waves', ['MAR-3233']],
    ['WAVES tab', ['MAR-3233']],
    // A number PREFIXES the identifier's number, never merely sits in it.
    // Mutation: plain substring on the number -> MAR-1320 joins `32`, red.
    ['32', ['MAR-3233', 'MAR-3200', 'MAR-32']],
    ['1320', ['MAR-1320']],
    ['320', ['MAR-3200']],
    ['mar-32', ['MAR-3233', 'MAR-3200', 'MAR-32']],
    ['nothing like it', []],
  ])('%s', (query, expected) => {
    expect(hits(query)).toEqual(expected)
  })

  it('a title that holds the digits matches as a title does', () => {
    expect(loomRowMatches(entry('MAR-9', 'Follow-up to 3233'), '3233')).toBe(
      true,
    )
  })

  it('the outside issues answer by the same rule', () => {
    expect(
      loomOutsideMatches(outsideIssue('MAR-1320', 'Codex daemon'), '32'),
    ).toBe(false)
    expect(
      loomOutsideMatches(outsideIssue('MAR-3240', 'Codex daemon'), '32'),
    ).toBe(true)
    expect(
      loomOutsideMatches(outsideIssue('MAR-1', 'Codex DAEMON'), 'daemon'),
    ).toBe(true)
  })
})

describe('R2: one filter, and no query is today', () => {
  const ROWS = [
    entry('EX-1', 'Working one', { state: 'working' }),
    entry('EX-2', 'Queued', { state: 'assigned' }),
    entry('EX-3', 'Shaping', { state: 'assigned', seat: null }),
    entry('EX-4', 'Finished', {
      state: 'done',
      seenAt: '2026-09-18T12:00:00.000Z',
    }),
    entry('EX-5', 'Reviewed', { state: 'reviewed' }),
  ]

  it('no query: the very same rows, and the sheets deep-equal the unfiltered derivation', () => {
    expect(loomSearchRows(ROWS, null)).toBe(ROWS)
    expect(loomSheets(loomSearchRows(ROWS, null), NOW)).toEqual(
      loomSheets(ROWS, NOW),
    )
  })

  it('a query: every sheet holds only the matching rows', () => {
    const sheets = loomSheets(loomSearchRows(ROWS, 'EX-2'), NOW)
    expect(sheets.next.map((row) => row.entry.issueIdentifier)).toEqual([
      'EX-2',
    ])
    expect(sheets.before).toEqual([])
    expect(sheets.plan).toEqual([])
    expect(sheets.now.inFlight).toEqual([])
    expect(sheets.now.awaitingQa).toEqual([])
  })
})

describe('R3 / R5: the summary says where', () => {
  const OLD = '2026-08-01T12:00:00.000Z'
  const ROWS = [
    entry('EX-10', 'Now work', { state: 'working' }),
    entry('EX-20', 'Plan work', { state: 'assigned', seat: null }),
    entry('EX-30', 'Left work', { state: 'unassigned' }),
    entry('EX-40', 'Old finished work', { state: 'done', seenAt: OLD }),
  ]
  const summarize = (
    query: string,
    open: 'before' | 'now' | 'next' | 'plan',
    outside: TrackerOutsideSnapshot | null = null,
  ) =>
    loomSearchSummary({
      sheets: loomSheets(loomSearchRows(ROWS, query), NOW),
      outside,
      query,
      open,
    })

  it('a match in another sheet is named, in the stack order', () => {
    const summary = summarize('work', 'next')
    expect(summary.elsewhere).toEqual([
      { sheet: 'before', count: 1 },
      { sheet: 'now', count: 1 },
      { sheet: 'plan', count: 2 },
    ])
    expect(summary.bySheet.next).toBe(0)
    expect(summary.total).toBe(4)
    expect(summary.notFound).toBe(false)
  })

  it('each counted bucket is a match: left the loop, older than the window, outside', () => {
    // Mutation: count only what the sheets LIST today (preparation, the
    // window) -> the `left` case reads "nowhere", red.
    expect(summarize('Left work', 'now').elsewhere).toEqual([
      { sheet: 'plan', count: 1 },
    ])
    expect(summarize('Old finished', 'now').elsewhere).toEqual([
      { sheet: 'before', count: 1 },
    ])
    const outside = snapshot([outsideIssue('EX-99', 'Loose end')])
    expect(summarize('loose', 'now', outside).elsewhere).toEqual([
      { sheet: 'plan', count: 1 },
    ])
    expect(summarize('loose', 'now', null).notFound).toBe(true)
  })

  it('nowhere', () => {
    const summary = summarize('zzz', 'plan', snapshot([]))
    expect(summary).toEqual({
      total: 0,
      bySheet: { before: 0, now: 0, next: 0, plan: 0 },
      elsewhere: [],
      notFound: true,
    })
  })

  it('the words', () => {
    expect(loomSearchElsewherePrefix('now')).toBe('No match in Now — ')
    expect(loomSearchElsewhereLabel({ sheet: 'plan', count: 1 })).toBe(
      '1 in Plan',
    )
  })

  it('the nowhere sentence: the outside clause only when read, other crews only when bound', () => {
    const base = {
      query: 'MAR-9999',
      crewName: 'Convergence',
      now: NOW,
      severalCrews: false,
    }
    expect(loomSearchNowhereLine({ ...base, outsideReadAt: null })).toBe(
      'No issue matches "MAR-9999" in Convergence\'s Loom. Loom reads issues that carry a Loom label.',
    )
    expect(
      loomSearchNowhereLine({
        ...base,
        outsideReadAt: '2026-09-19T11:55:00.000Z',
      }),
    ).toBe(
      'No issue matches "MAR-9999" in Convergence\'s Loom. Loom reads issues that carry a Loom label; "Not in the loop" lists this project\'s other open issues, read 5m ago.',
    )
    expect(
      loomSearchNowhereLine({
        ...base,
        outsideReadAt: null,
        severalCrews: true,
      }),
    ).toBe(
      'No issue matches "MAR-9999" in Convergence\'s Loom. Loom reads issues that carry a Loom label. Other crews are not searched.',
    )
  })
})

describe('R5: the headings over the listed buckets', () => {
  it('say what the bucket is, with the window’s own number', () => {
    expect(LOOM_SEARCH_LEFT_TITLE).toBe('Left the loop')
    expect(LOOM_SEARCH_OLDER_TITLE).toBe('Older than 14 days')
  })
})

describe('R5: the outside group under a query', () => {
  const ISSUES = [
    outsideIssue('EX-71', 'Loose seventy-one'),
    outsideIssue('EX-72', 'Another thing'),
  ]

  it('no query: exactly the view MAR-3236 drew', () => {
    expect(loomOutsideView(snapshot(ISSUES), null)).toEqual(
      loomOutsideView(snapshot(ISSUES)),
    )
  })

  it('a query: the title counts the matches, and a miss has nothing to unfold', () => {
    const hit = loomOutsideView(snapshot(ISSUES), 'loose')
    expect(hit.title).toBe('Not in the loop · 1')
    expect(hit.rows.map((issue) => issue.identifier)).toEqual(['EX-71'])
    expect(hit.foldable).toBe(true)

    const miss = loomOutsideView(snapshot(ISSUES, true), 'zzz')
    expect(miss.title).toBe('Not in the loop · 0+')
    expect(miss.foldable).toBe(false)
    // "Every open issue carries a label" is a sentence about the project,
    // never about a filtered list.
    expect(miss.emptyLine).toBeNull()
  })

  it('the cut line says how many and whose, never "newest"', () => {
    expect(LOOM_OUTSIDE_MORE_LINE).toBe(
      "More in Linear — showing 300 of this project's open issues",
    )
  })
})

describe('R4: a horse is not an issue', () => {
  const horse = (key: string, held: WorkLedgerEntry | null): LoomHorse => ({
    key,
    crewId: 'crew-1',
    crewName: null,
    seat: key,
    kind: 'resident',
    runtime: held ? 'working' : 'idle',
    hostLabel: null,
    hostMarker: null,
    sessionId: `session-${key}`,
    openable: true,
    held: held
      ? {
          entry: held,
          action: null,
          hostMarker: null,
          crewName: null,
          lapLabel: 'lap 1',
        }
      : null,
    heldFrom: held ? 'in-flight' : null,
    conversationMissing: false,
    returned: null,
    compacting: false,
  })
  const HORSES = [
    horse('opus', entry('MAR-3233', 'Retire the Waves tab')),
    horse('glm', entry('MAR-3234', 'Loom search')),
    horse('idle', null),
  ]

  it('shown iff the held issue matches; every horse with no query', () => {
    expect(loomSearchHorses(HORSES, null)).toBe(HORSES)
    expect(loomSearchHorses(HORSES, '3234').map((h) => h.key)).toEqual(['glm'])
    expect(loomSearchHorses(HORSES, 'nothing')).toEqual([])
  })

  it('the line counts the shown cards, and says why when none', () => {
    const shown = loomSearchHorses(HORSES, '3234')
    expect(loomSearchHorsesLine(shown, HORSES)).toBe(
      '1 horse · 1 working · 0 idle · 0 failed · 0 not seen',
    )
    expect(loomSearchHorsesLine([], HORSES)).toBe(LOOM_SEARCH_NO_HORSE_LINE)
    expect(loomSearchHorsesLine([], [])).toBe(LOOM_NO_HORSES_LINE)
  })
})

describe('R6: the `/` shortcut', () => {
  const element = (tagName: string, extra: Record<string, unknown> = {}) => ({
    tagName,
    isContentEditable: false,
    getAttribute: () => null,
    ...extra,
  })

  it('outside a text input, with no modifier', () => {
    expect(isLoomSearchShortcut({ key: '/', target: element('BUTTON') })).toBe(
      true,
    )
    expect(isLoomSearchShortcut({ key: '/', target: element('INPUT') })).toBe(
      false,
    )
    expect(
      isLoomSearchShortcut({ key: '/', target: element('TEXTAREA') }),
    ).toBe(false)
    expect(
      isLoomSearchShortcut({
        key: '/',
        target: element('DIV', { isContentEditable: true }),
      }),
    ).toBe(false)
    expect(
      isLoomSearchShortcut({
        key: '/',
        target: element('DIV', { getAttribute: () => 'option' }),
      }),
    ).toBe(false)
    expect(
      isLoomSearchShortcut({
        key: '/',
        metaKey: true,
        target: element('BUTTON'),
      }),
    ).toBe(false)
    expect(isLoomSearchShortcut({ key: 'a', target: element('BUTTON') })).toBe(
      false,
    )
  })
})
