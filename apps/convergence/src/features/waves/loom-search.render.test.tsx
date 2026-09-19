import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { useSessionCrewStore, type SessionCrew } from '@/entities/session-crew'
import {
  useWorkLedgerStore,
  type WorkLedgerEntry,
  type WorkLedgerSnapshot,
} from '@/entities/work-ledger'
import type {
  TrackerOutsideIssue,
  TrackerOutsideSnapshot,
} from '@/shared/types/tracker.types'
import { WavePanel } from './wave-panel.container'
import { loomSearchRows } from './loom-search.pure'
import { boundCrewWith, ledgerEntry, residentSeat } from './wave-rows.fixture'

/**
 * Loom's search, rendered (MAR-3234; the MAR-2280 law): through the real
 * containers and stores, in both of Loom's shapes, asserted on the screen.
 *
 * `loomSearchRows` is the real function behind a spy, so R10 can count how
 * many times the rows were filtered while a person typed.
 */
vi.mock('./loom-search.pure', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./loom-search.pure')>()
  return { ...actual, loomSearchRows: vi.fn(actual.loomSearchRows) }
})

const NOW = Date.parse('2026-09-19T12:00:00.000Z')
const AT = '2026-09-19T11:00:00.000Z'
const RESERVED = 260

const session = (id: string): SessionSummary =>
  ({
    id,
    name: id,
    status: 'running',
    attention: 'none',
    updatedAt: AT,
    executionHost: 'local',
  }) as SessionSummary

const row = (
  identifier: string,
  title: string,
  overrides: Partial<WorkLedgerEntry> = {},
): WorkLedgerEntry =>
  ledgerEntry({
    issueIdentifier: identifier,
    issueTitle: title,
    seenAt: AT,
    ...overrides,
  })

/** One issue per place Loom can put it -- and one per counted bucket. */
const ROWS: WorkLedgerEntry[] = [
  // Held by opus's card on Now.
  row('EX-NOW', 'Opus is on this', { state: 'working' }),
  // Held by glm's card on Now.
  row('EX-GLM', 'Glm is on this', {
    state: 'working',
    seat: 'glm',
    sessionId: 'session-glm',
  }),
  // Queued at opus, on Next.
  row('EX-NEXT', 'Queued for opus', { state: 'assigned' }),
  // Being prepared, on Plan.
  row('EX-PLAN', 'Shaping the plan', {
    state: 'assigned',
    seat: null,
    sessionId: null,
    fact: {
      logicalStatus: null,
      branchName: null,
      updatedAt: null,
      groomMe: true,
    },
  }),
  // Counted on Plan, not listed: it left the loop.
  row('EX-LEFT', 'Gone from the loop', {
    state: 'unassigned',
    seat: null,
    sessionId: null,
  }),
  // Counted on Before, not listed: older than the window.
  row('EX-OLD', 'Ancient finished work', {
    state: 'done',
    seenAt: '2026-08-01T12:00:00.000Z',
  }),
  // Listed on Before.
  row('EX-DONE', 'Recently finished', { state: 'done' }),
]

const outsideIssue = (
  identifier: string,
  title: string,
): TrackerOutsideIssue => ({
  id: `id-${identifier}`,
  identifier,
  title,
  url: `https://linear.app/example/issue/${identifier.toLowerCase()}`,
  status: 'Backlog',
  priority: null,
  labels: [],
  updatedAt: '2026-09-19T09:00:00.000Z',
})

const OUTSIDE: TrackerOutsideSnapshot = {
  crewId: 'crew-1',
  issues: [
    outsideIssue('EX-OUT', 'Loose outside issue'),
    outsideIssue('EX-OUT2', 'Another stray'),
  ],
  more: false,
  readAt: '2026-09-19T11:55:00.000Z',
}

let crews: SessionCrew[]
let ledgers: Record<string, WorkLedgerSnapshot>
let api: Record<string, Record<string, ReturnType<typeof vi.fn>>>

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  vi.mocked(loomSearchRows).mockClear()
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1400,
  })
  crews = [
    boundCrewWith('crew-1', 'Convergence', [
      residentSeat('opus'),
      residentSeat('glm'),
    ]),
  ]
  ledgers = {
    'crew-1': { crewId: 'crew-1', entries: ROWS, trackerHealth: null },
    'crew-2': {
      crewId: 'crew-2',
      entries: [row('NS-1', 'Other crew work', { crewId: 'crew-2' })],
      trackerHealth: null,
    },
  }
  api = {
    crew: {
      list: vi.fn(async () => crews),
      onUpdated: vi.fn(() => () => {}),
    },
    workLedger: {
      list: vi.fn(async (crewId: string) => ledgers[crewId]),
      onUpdated: vi.fn(() => () => {}),
    },
    tracker: {
      outside: vi.fn(async (crewId: string) =>
        crewId === 'crew-1' ? OUTSIDE : null,
      ),
      onOutsideUpdated: vi.fn(() => () => {}),
    },
  }
  ;(window as unknown as { electronAPI: unknown }).electronAPI = api
  useSessionStore.setState({
    globalSessions: [session('session-opus'), session('session-glm')],
  })
  useWorkLedgerStore.setState({
    snapshots: {},
    broadcastCount: {},
    error: null,
    unsubscribeBroadcast: null,
  })
  useSessionCrewStore.setState({ crews: [] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
  localStorage.clear()
})

async function mount(shape: 'compact' | 'expanded' = 'compact') {
  await act(async () => {
    render(<WavePanel reservedWidth={RESERVED} />)
  })
  await screen.findByLabelText('Loom')
  // The rows land a microtask after the crews do.
  await screen.findByText(/^Now · 2 open/)
  if (shape === 'expanded') {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
    })
  }
}

const field = () =>
  screen.getByRole('searchbox', { name: 'Search Loom' }) as HTMLInputElement
const icon = () => screen.getByRole('button', { name: 'Search Loom' })

/** Types and presses Enter: Enter applies at once (R10). */
async function search(text: string) {
  if (!screen.queryByRole('searchbox', { name: 'Search Loom' })) {
    await act(async () => {
      fireEvent.click(icon())
    })
  }
  await act(async () => {
    fireEvent.change(field(), { target: { value: text } })
  })
  await act(async () => {
    fireEvent.keyDown(field(), { key: 'Enter' })
  })
}

async function clearSearch() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  })
}

const title = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name} · `) })
const titles = () =>
  // The accessible name: expanded draws a closed title as two lines.
  ['Before', 'Now', 'Next', 'Plan'].map((name) =>
    title(name).getAttribute('aria-label'),
  )
const body = (sheet: string) =>
  document.querySelector(`[data-loom-sheet="${sheet}"]`) as HTMLElement | null
const miss = () =>
  document.querySelector('[data-loom-search-miss]') as HTMLElement | null
const rowIn = (sheet: string, identifier: string) =>
  body(sheet)?.querySelector(`[data-wave-row="crew-1:${identifier}"]`) ?? null
const horseKeys = () =>
  [...document.querySelectorAll('[data-loom-horse]')].map((node) =>
    node.getAttribute('data-loom-horse'),
  )
const horsesLine = () =>
  (body('now')?.querySelector('section[aria-label="Horses"] h3')?.textContent ??
    null) as string | null

describe('MAR-3234 R7: both shapes', () => {
  it('compact: the icon reveals the field under the header and focuses it; a query keeps it', async () => {
    await mount('compact')
    expect(screen.queryByRole('searchbox', { name: 'Search Loom' })).toBeNull()
    expect(icon().getAttribute('aria-expanded')).toBe('false')

    await act(async () => {
      fireEvent.click(icon())
    })
    expect(icon().getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(field())
    // Its own row, after the header and before the stack.
    const loom = document.querySelector('[data-loom="compact"]') as HTMLElement
    const search = loom.querySelector('[data-loom-search]') as HTMLElement
    const stackStart = title('Before')
    expect(
      search.compareDocumentPosition(stackStart) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    // Holding a query, the icon cannot hide it.
    await act(async () => {
      fireEvent.change(field(), { target: { value: 'EX' } })
    })
    await act(async () => {
      fireEvent.click(icon())
    })
    expect(field()).toBeTruthy()
    // Empty, it can.
    await clearSearch()
    await act(async () => {
      fireEvent.click(icon())
    })
    expect(screen.queryByRole('searchbox', { name: 'Search Loom' })).toBeNull()
  })

  it('expanded: the field sits in the header row between the subline and How Loom works', async () => {
    await mount('expanded')
    const loom = document.querySelector('[data-loom="expanded"]') as HTMLElement
    const header = loom.firstElementChild as HTMLElement
    const kids = [...header.children]
    const at = (node: Element | null) => kids.indexOf(node as Element)
    const subline = header.querySelector('p')
    const search = header.querySelector('[data-loom-search]')
    const guide = [...header.querySelectorAll('button')].find((button) =>
      /How Loom works/.test(button.textContent ?? ''),
    )
    expect(search?.contains(field())).toBe(true)
    expect(at(subline)).toBeLessThan(at(search))
    expect(at(search)).toBe(at(guide!) - 1)
    expect(search?.className).toMatch(/max-w-\[240px\]/)
    // No icon in expanded: the field is always there.
    expect(screen.queryByRole('button', { name: 'Search Loom' })).toBeNull()
  })
})

describe('MAR-3234 R2: one filter, every number follows', () => {
  const UNFILTERED = [
    'Before · 1 done',
    'Now · 2 open · 0 awaiting QA',
    'Next · 0 ready · 1 preparing',
    'Plan · 1 in preparation',
  ]

  it('compact and expanded: the titles are the matching rows’, and clearing gives back today’s', async () => {
    await mount('compact')
    expect(titles()).toEqual(UNFILTERED)
    await search('EX-PLAN')
    // Mutation: filter the rendered rows but count from the unfiltered
    // sheets -> today's titles here, red.
    expect(titles()).toEqual([
      'Before · 0 done',
      'Now · 0 open · 0 awaiting QA',
      'Next · 0 ready',
      'Plan · 1 in preparation',
    ])
    await clearSearch()
    expect(titles()).toEqual(UNFILTERED)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
    })
    await search('recently')
    expect(titles()).toEqual([
      'Before · 1 done',
      'Now · 0 open · 0 awaiting QA',
      'Next · 0 ready',
      'Plan · 0 in preparation',
    ])
  })
})

describe('MAR-3234 R3: the place is kept, and the match is one click away', () => {
  it('scroll 240 in Now -> a Plan-only issue -> the line -> Plan -> clear -> Now at 240', async () => {
    await mount('compact')
    fireEvent.scroll(body('now')!, { target: { scrollTop: 240 } })

    await search('EX-PLAN')
    // The open sheet did not move by itself. Mutation: auto-switch to the
    // sheet holding the match -> no Now body, red.
    expect(body('now')).toBeTruthy()
    expect(miss()?.textContent).toBe('No match in Now — 1 in Plan')
    // A filtered sheet is shorter: Chromium clamps and fires a scroll.
    // Mutation: do not freeze the memory while searched -> 0 is recorded
    // over 240, red below.
    fireEvent.scroll(body('now')!, { target: { scrollTop: 0 } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1 in Plan' }))
    })
    expect(body('plan')).toBeTruthy()
    expect(rowIn('plan', 'EX-PLAN')).toBeTruthy()

    await clearSearch()
    // Clearing keeps the sheet the person is on.
    expect(body('plan')).toBeTruthy()
    await act(async () => {
      fireEvent.click(title('Now'))
    })
    expect(body('now')!.scrollTop).toBe(240)
  })

  it('a clear on the same sheet gives its place back at once', async () => {
    await mount('compact')
    fireEvent.scroll(body('now')!, { target: { scrollTop: 180 } })
    await search('EX-GLM')
    fireEvent.scroll(body('now')!, { target: { scrollTop: 0 } })
    await clearSearch()
    // Mutation: drop the restore on a clear -> 0, red.
    expect(body('now')!.scrollTop).toBe(180)
  })

  it('several other sheets: each is its own door, in the stack’s order', async () => {
    await mount('compact')
    await act(async () => {
      fireEvent.click(title('Next'))
    })
    await search('finished')
    expect(miss()?.textContent).toBe('No match in Next — 2 in Before')
    await search('on')
    // "Opus is on this", "Glm is on this" on Now, "Gone from the loop" on
    // Plan -- and none of them on Next.
    // (and `EX-DONE` on Before, whose identifier holds "ON").
    expect(miss()?.textContent).toBe(
      'No match in Next — 1 in Before, 2 in Now, 1 in Plan',
    )
    expect(
      [...miss()!.querySelectorAll('button')].map((b) => b.textContent),
    ).toEqual(['1 in Before', '2 in Now', '1 in Plan'])
  })
})

describe('MAR-3234 R4: a horse is not an issue', () => {
  it('a card iff the issue it holds matches; the line counts the shown cards', async () => {
    await mount('compact')
    expect(horseKeys()).toEqual(['crew-1:session-opus', 'crew-1:session-glm'])
    expect(horsesLine()).toBe(
      '2 horses · 2 working · 0 idle · 0 failed · 0 not seen',
    )

    await search('EX-GLM')
    expect(horseKeys()).toEqual(['crew-1:session-glm'])
    expect(horsesLine()).toBe(
      '1 horse · 1 working · 0 idle · 0 failed · 0 not seen',
    )

    await clearSearch()
    expect(horseKeys()).toEqual(['crew-1:session-opus', 'crew-1:session-glm'])
  })

  it('a horse whose issue does not match is still on it -- Next says so', async () => {
    await mount('compact')
    await act(async () => {
      fireEvent.click(title('Next'))
    })
    await search('EX-NEXT')
    const hints = [...body('next')!.querySelectorAll('[data-wave-hint]')].map(
      (node) => node.textContent,
    )
    // Mutation: derive the horses from the FILTERED rows -> opus holds
    // nothing, and its queue reads `This Mac · Working · 1 queued`, red.
    expect(hints).toEqual(['This Mac · Working on EX-NOW · 1 queued'])
  })
})

describe('MAR-3234 R5: the counted buckets answer too, and "nowhere" says why', () => {
  it('left the loop: listed on Plan under its own heading', async () => {
    await mount('compact')
    await search('gone from')
    // Mutation: count only what the sheets list today -> "nowhere", red.
    expect(miss()?.textContent).toBe('No match in Now — 1 in Plan')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1 in Plan' }))
    })
    const section = body('plan')!.querySelector(
      'section[aria-label="Left the loop"]',
    )
    expect(section?.querySelector('h3')?.textContent).toBe('Left the loop · 1')
    expect(rowIn('plan', 'EX-LEFT')).toBeTruthy()
    // Listed, so not also counted in a sentence.
    expect(body('plan')!.textContent).not.toMatch(/issues? left the loop/)
  })

  it('older than the window: listed on Before under its own heading', async () => {
    await mount('compact')
    await search('ancient')
    expect(miss()?.textContent).toBe('No match in Now — 1 in Before')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1 in Before' }))
    })
    expect(
      body('before')!.querySelector('section[aria-label="Older than 14 days"]'),
    ).toBeTruthy()
    expect(rowIn('before', 'EX-OLD')).toBeTruthy()
    expect(body('before')!.textContent).not.toMatch(/older issues? not shown/)
  })

  it('outside the loop: inside "Not in the loop", which opens by itself and closes on a clear', async () => {
    await mount('compact')
    await search('loose outside')
    expect(miss()?.textContent).toBe('No match in Now — 1 in Plan')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1 in Plan' }))
    })
    const fold = () =>
      screen.getByRole('button', { name: /^Not in the loop · / })
    expect(fold().textContent).toBe('Not in the loop · 1')
    // Mutation: leave the group folded under a match -> 'false', red.
    expect(fold().getAttribute('aria-expanded')).toBe('true')
    expect(
      [...document.querySelectorAll('[data-loom-outside-row]')].map((node) =>
        node.getAttribute('data-loom-outside-row'),
      ),
    ).toEqual(['EX-OUT'])

    await clearSearch()
    expect(fold().textContent).toBe('Not in the loop · 2')
    expect(fold().getAttribute('aria-expanded')).toBe('false')
  })

  it('nowhere: one sentence, with the outside read’s age', async () => {
    await mount('compact')
    await search('zzz')
    expect(miss()?.textContent).toBe(
      'No issue matches "zzz" in Convergence\'s Loom. Loom reads issues that carry a Loom label; "Not in the loop" lists this project\'s other open issues, read 5m ago.',
    )
    expect(miss()!.querySelector('button')).toBeNull()
  })

  it('nowhere with several crews bound: the other crews are named as not searched', async () => {
    crews = [
      ...crews,
      { ...boundCrewWith('crew-2', 'Studio', []), position: 1 },
    ]
    await mount('compact')
    await search('NS-1')
    expect(miss()?.textContent).toMatch(/ Other crews are not searched\.$/)
  })
})

describe('MAR-3234 R6: keyboard and Escape order', () => {
  it('expanded: Escape clears, then closes the detail, then folds', async () => {
    await mount('expanded')
    await search('EX-PLAN')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1 in Plan' }))
    })
    // Focused first, as a keyboard or a pointer leaves it: closing the
    // detail gives focus back to it, so the third Escape starts in Loom.
    const opener = rowIn('plan', 'EX-PLAN') as HTMLElement
    opener.focus()
    await act(async () => {
      fireEvent.click(opener)
    })
    expect(document.querySelector('[data-loom-detail]')).toBeTruthy()

    const escape = async () => {
      await act(async () => {
        fireEvent.keyDown(document.activeElement ?? document.body, {
          key: 'Escape',
        })
      })
    }
    await escape()
    // Mutation: fold (or close the detail) on the first Escape -> red.
    expect(field().value).toBe('')
    expect(document.querySelector('[data-loom-detail]')).toBeTruthy()
    expect(document.querySelector('[data-loom="expanded"]')).toBeTruthy()

    await escape()
    expect(document.querySelector('[data-loom-detail]')).toBeNull()
    expect(document.querySelector('[data-loom="expanded"]')).toBeTruthy()

    await escape()
    expect(document.querySelector('[data-loom="compact"]')).toBeTruthy()
  })

  it('`/` focuses the field from inside Loom, and is a character inside the field', async () => {
    await mount('expanded')
    title('Now').focus()
    await act(async () => {
      fireEvent.keyDown(title('Now'), { key: '/' })
    })
    expect(document.activeElement).toBe(field())
    // In the field it is typed, not swallowed.
    expect(fireEvent.keyDown(field(), { key: '/' })).toBe(true)
  })

  it('compact: `/` reveals the field and focuses it', async () => {
    await mount('compact')
    await act(async () => {
      fireEvent.keyDown(title('Now'), { key: '/' })
    })
    expect(document.activeElement).toBe(field())
  })
})

describe('MAR-3234 R8: nothing is stored or asked', () => {
  it('typing writes no storage and calls no door; a crew switch clears the query', async () => {
    crews = [
      ...crews,
      { ...boundCrewWith('crew-2', 'Studio', []), position: 1 },
    ]
    await mount('compact')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const calls = () =>
      Object.values(api).flatMap((door) =>
        Object.values(door).map((fn) => fn.mock.calls.length),
      )
    const before = calls()

    await act(async () => {
      fireEvent.click(icon())
    })
    for (const text of ['E', 'EX', 'EX-', 'EX-PLAN']) {
      await act(async () => {
        fireEvent.change(field(), { target: { value: text } })
      })
    }
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    await act(async () => {
      fireEvent.keyDown(field(), { key: 'Enter' })
    })
    expect(miss()?.textContent).toBe('No match in Now — 1 in Plan')
    // Mutation: persist the query -> a setItem call, red.
    expect(setItem).not.toHaveBeenCalled()
    expect(calls()).toEqual(before)

    // Another crew is another Loom.
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Crew' }), {
        key: 'Enter',
      })
    })
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('option', { name: 'Studio' }), {
        key: 'Enter',
      })
    })
    // Mutation: keep the query across a switch -> 'EX-PLAN' here, red.
    expect(field().value).toBe('')
    expect(miss()).toBeNull()
  })

  it('the strip empties it', async () => {
    await mount('compact')
    await search('EX-PLAN')
    expect(miss()).toBeTruthy()
    // Narrow past the column, then wide again.
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 600,
    })
    await act(async () => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(document.querySelector('[data-loom="strip"]')).toBeTruthy()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1400,
    })
    await act(async () => {
      window.dispatchEvent(new Event('resize'))
    })
    // Mutation: drop the strip's clear -> 'EX-PLAN' and a filtered Now, red.
    expect(field().value).toBe('')
    expect(titles()[1]).toBe('Now · 2 open · 0 awaiting QA')
  })
})

describe('MAR-3234 R10: typing is cheap', () => {
  it('3233 key by key: unfiltered at 199 ms, filtered at 200 ms, ONE derivation; a clear is at once', async () => {
    ledgers['crew-1'] = {
      crewId: 'crew-1',
      entries: [
        ...ROWS,
        row('EX-3233', 'Retire the Waves tab', {
          state: 'assigned',
          seat: null,
          sessionId: null,
        }),
      ],
      trackerHealth: null,
    }
    await mount('compact')
    await act(async () => {
      fireEvent.click(icon())
    })
    // Exact time from here on: nothing may advance but what this test asks.
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.mocked(loomSearchRows).mockClear()

    for (const text of ['3', '32', '323', '3233']) {
      act(() => {
        fireEvent.change(field(), { target: { value: text } })
      })
      // The input never lags.
      expect(field().value).toBe(text)
      act(() => {
        vi.advanceTimersByTime(50)
      })
    }
    act(() => {
      vi.advanceTimersByTime(149)
    })
    // 199 ms after the last key: the sheets are not filtered yet.
    expect(title('Now').textContent).toBe('Now · 2 open · 0 awaiting QA')
    expect(miss()).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(title('Now').textContent).toBe('Now · 0 open · 0 awaiting QA')
    expect(miss()?.textContent).toBe('No match in Now — 1 in Plan')
    // Mutation: filter on every keystroke -> four derivations, red.
    expect(vi.mocked(loomSearchRows)).toHaveBeenCalledTimes(1)

    // A clear is never a wait. Mutation: debounce the clear -> still
    // filtered in this tick, red.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    })
    expect(title('Now').textContent).toBe('Now · 2 open · 0 awaiting QA')
    expect(miss()).toBeNull()

    // An emptied input is a clear too.
    act(() => {
      fireEvent.change(field(), { target: { value: 'zz' } })
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(miss()).toBeTruthy()
    act(() => {
      fireEvent.change(field(), { target: { value: '' } })
    })
    expect(miss()).toBeNull()
  })
})

describe('MAR-3194 R6 with a real outside door (MAR-3236 verdict): Plan is still read-only', () => {
  it('every control in Plan is a row, the "Not in the loop" fold, or a Linear link inside it', async () => {
    await mount('compact')
    await act(async () => {
      fireEvent.click(title('Plan'))
    })
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /^Not in the loop · / }),
      )
    })
    const plan = body('plan')!
    expect(
      plan.querySelectorAll(
        'input, select, textarea, [contenteditable="true"]',
      ),
    ).toHaveLength(0)
    const controls = [
      ...plan.querySelectorAll('button, summary, a[href], [role="button"]'),
    ]
    const group = plan.querySelector('[data-loom-outside]')!
    const kind = (node: Element) =>
      node.closest('[data-wave-row]')
        ? 'row'
        : node.tagName === 'BUTTON' &&
            node.parentElement === group &&
            node.getAttribute('aria-controls') === 'loom-not-in-the-loop'
          ? 'fold'
          : node.tagName === 'A' &&
              group.contains(node) &&
              node.getAttribute('href')?.startsWith('https://linear.app/')
            ? 'linear'
            : 'stray'
    // Mutation: a stray button in Plan -> a 'stray' here, red.
    expect(controls.map(kind).sort()).toEqual([
      'fold',
      'linear',
      'linear',
      'row',
    ])
  })
})
