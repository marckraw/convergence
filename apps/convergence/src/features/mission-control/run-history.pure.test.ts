import { describe, expect, it } from 'vitest'
import type { CrewHail } from '@/entities/crew-hail'
import type { RelayHop } from '@/entities/session-relay'
import type {
  RelayRun,
  RelayRunPage,
  RunHistoryOutcome,
  RunStatus,
} from '@/entities/run-history'
import {
  appendRunPage,
  buildHailEventRow,
  buildHopEventRow,
  buildRunEvents,
  buildRunHighlight,
  buildRunRow,
  filterRuns,
  formatRunStatusLine,
  formatRunSummary,
  formatRunTime,
  historyOutcomeTone,
  historyOutcomeWord,
  historyPanelState,
  formatEventTime,
  runStartingStation,
  runTone,
} from './run-history.pure'

const NAMES: Record<string, string> = {
  fable: 'Fable',
  opus: 'Opus',
  sol: 'Sol · reviewer',
}
const resolveName = (id: string): string | null => NAMES[id] ?? null

function hop(overrides: Partial<RelayHop> & { id: string }): RelayHop {
  return {
    settleId: null,
    relayId: 'wire-a',
    crewId: 'c1',
    flowRunId: 'run-1',
    firedAt: '2026-09-06T14:32:10.000Z',
    sourceSessionId: 'fable',
    targetSessionId: 'opus',
    spawnedSessionId: null,
    triggerStatus: 'completed',
    payloadPreview: null,
    baton: null,
    roundNumber: 1,
    lapNumber: 1,
    settledAt: '2026-09-06T14:33:00.000Z',
    outcome: 'delivered',
    error: null,
    ...overrides,
  }
}

function hail(overrides: Partial<CrewHail> & { id: string }): CrewHail {
  return {
    crewId: 'c1',
    flowRunId: 'run-1',
    reason: 'terminal',
    sessionId: 'fable',
    baton: 'marcin',
    message: null,
    detail: 'This station handed the work to you.',
    raisedAt: '2026-09-06T14:39:00.000Z',
    acknowledgedAt: null,
    ...overrides,
  }
}

function run(overrides: Partial<RelayRun> = {}): RelayRun {
  const hops = overrides.laps?.flatMap((lap) => lap.hops) ?? [hop({ id: 'h1' })]
  return {
    flowRunId: 'run-1',
    crewId: 'c1',
    startedAt: '2026-09-06T14:32:10.000Z',
    endedAt: '2026-09-06T14:39:00.000Z',
    lastActivityAt: '2026-09-06T14:39:00.000Z',
    owedBy: null,
    handedBackAt: null,
    laps: [{ lap: 1, hops }],
    hails: [],
    status: { word: 'finished-quiet', reason: null } as RunStatus,
    counts: {
      deliveries: hops.length,
      failures: 0,
      laps: 1,
      events: hops.length,
    },
    ...overrides,
  }
}

/** The words the page carries, keyed by event id. */
function outcomesFor(
  entries: Array<[string, RunHistoryOutcome]>,
): Record<string, RunHistoryOutcome> {
  return Object.fromEntries(entries)
}

describe('the words history speaks', () => {
  it('keeps queued apart from delivered, and neither is an alarm', () => {
    expect(historyOutcomeWord('queued')).toBe('Queued')
    expect(historyOutcomeWord('delivered')).toBe('Delivered')
    expect(historyOutcomeTone('queued')).toBe('delivered')
    expect(historyOutcomeTone('delivered')).toBe('delivered')
  })

  it('never paints an unreadable record red', () => {
    // The vocabulary law at the colour: red is for what this build
    // understands to be wrong, never for a word it has not heard of.
    expect(historyOutcomeTone('unknown')).toBe('unknown')
    expect(historyOutcomeWord('unknown')).toBe('Unknown outcome')
  })

  it('keeps a legacy loop-closed row quiet', () => {
    expect(historyOutcomeTone('loop-closed')).toBe('held')
  })
})

describe('formatRunStatusLine', () => {
  /**
   * THE masquerade canary at the words layer. A run that needs him must never
   * read as one he was handed back, and each of the four ways it can need him
   * is a DIFFERENT next action.
   *
   * Mutation that reds it: collapse the needs-you branch to one sentence.
   */
  it('gives the four ways a run needs you four different sentences', () => {
    const lines = (['failed', 'limit', 'parked', 'stalled'] as const).map(
      (reason) =>
        formatRunStatusLine(
          run({
            status: { word: 'needs-you', reason },
            counts: { deliveries: 3, failures: 1, laps: 1, events: 4 },
          }),
        ),
    )

    expect(new Set(lines).size).toBe(4)
    for (const line of lines) {
      expect(line.toLowerCase()).not.toContain('handed back')
    }
    expect(lines[0]).toBe('1 delivery error')
  })

  it('says how many laps a handed-back run took', () => {
    expect(
      formatRunStatusLine(
        run({
          laps: [1, 2, 3].map((lap) => ({
            lap,
            hops: [hop({ id: `lap-${lap}`, lapNumber: lap })],
          })),
          status: { word: 'handed-back', reason: null },
          counts: { deliveries: 9, failures: 0, laps: 3, events: 10 },
        }),
      ),
    ).toBe('3 laps · handed back')
  })

  it('does not call a quiet run a success', () => {
    // `finished-quiet` is not "succeeded": nothing here knows whether the
    // work was any good.
    const line = formatRunStatusLine(run())
    expect(line).toBe('1 delivery')
    expect(line.toLowerCase()).not.toContain('success')
  })
})

describe('the run list', () => {
  it('names the conversation a run started from, from the record', () => {
    expect(runStartingStation(run(), resolveName)).toBe('Fable')
  })

  /**
   * Promise 6, at the source: a run is a historical fact, so a conversation
   * that has since left the crew still has to render as what it was.
   *
   * Mutation that reds it: resolve names from current membership only — the
   * row goes blank or says "a conversation that is gone".
   */
  it('still renders a run whose station has since been removed', () => {
    const row = buildRunRow(
      run({
        laps: [{ lap: 1, hops: [hop({ id: 'h1', sourceSessionId: 'ghost' })] }],
      }),
      resolveName,
      new Date('2026-09-06T15:00:00.000Z'),
    )

    expect(row.startingStation).toBeNull()
    // And the row is still a row: the run is not hidden because a name is.
    expect(row.statusLine).toBe('1 delivery')
    expect(row.flowRunId).toBe('run-1')
  })

  it('reads today as a clock and older days by name', () => {
    const now = new Date('2026-09-06T15:00:00.000Z')
    expect(formatRunTime('2026-09-06T14:32:00.000Z', now)).toMatch(
      /^\d\d:\d\d$/,
    )
    expect(formatRunTime('2026-09-05T17:46:00.000Z', now)).toContain(
      'Yesterday',
    )
    expect(formatRunTime('2026-09-01T17:46:00.000Z', now)).toContain('Sep')
    expect(formatRunTime('not a time', now)).toBe('unknown time')
  })

  it('narrows the view without touching the record', () => {
    const needsYou = run({
      flowRunId: 'needs',
      status: { word: 'needs-you', reason: 'failed' },
      counts: { deliveries: 1, failures: 1, laps: 1, events: 2 },
    })
    const handedBack = run({
      flowRunId: 'handed',
      status: { word: 'handed-back', reason: null },
    })
    const runs = [needsYou, handedBack]

    expect(filterRuns(runs, 'all')).toHaveLength(2)
    expect(filterRuns(runs, 'needs-you').map((r) => r.flowRunId)).toEqual([
      'needs',
    ])
    expect(filterRuns(runs, 'handed-back').map((r) => r.flowRunId)).toEqual([
      'handed',
    ])
    expect(filterRuns(runs, 'failed').map((r) => r.flowRunId)).toEqual([
      'needs',
    ])
  })
})

describe('historyPanelState', () => {
  function page(overrides: Partial<RelayRunPage> = {}): RelayRunPage {
    return {
      runs: [],
      unattributedHails: [],
      outcomes: {},
      hasMore: false,
      nextCursor: null,
      ...overrides,
    }
  }

  /**
   * THE four-states canary (promise 7). Merging "no records" with "no
   * matches" would tell somebody their crew has never run when they had
   * simply narrowed the list.
   *
   * Mutation that reds it: return `empty` whenever `visibleRuns === 0`.
   */
  it('tells no records apart from no matches, and both from loading', () => {
    expect(
      historyPanelState({
        loading: true,
        error: null,
        page: null,
        visibleRuns: 0,
      }),
    ).toBe('loading')
    expect(
      historyPanelState({
        loading: false,
        error: 'boom',
        page: null,
        visibleRuns: 0,
      }),
    ).toBe('error')
    expect(
      historyPanelState({
        loading: false,
        error: null,
        page: page(),
        visibleRuns: 0,
      }),
    ).toBe('empty')
    expect(
      historyPanelState({
        loading: false,
        error: null,
        page: page({ runs: [run()] }),
        visibleRuns: 0,
      }),
    ).toBe('no-match')
    expect(
      historyPanelState({
        loading: false,
        error: null,
        page: page({ runs: [run()] }),
        visibleRuns: 1,
      }),
    ).toBe('ready')
  })

  it('is not empty when the only records are calls with no run', () => {
    expect(
      historyPanelState({
        loading: false,
        error: null,
        page: page({ unattributedHails: [hail({ id: 'x', flowRunId: null })] }),
        visibleRuns: 0,
      }),
    ).toBe('ready')
  })
})

describe('buildRunEvents', () => {
  const threeLaps = run({
    flowRunId: 'run-1',
    laps: [
      {
        lap: 1,
        hops: [
          hop({ id: 'a1', relayId: 'w1', baton: 'horse' }),
          hop({ id: 'b1', relayId: 'w2' }),
          hop({ id: 'c1', relayId: 'w3' }),
        ],
      },
      {
        lap: 2,
        hops: [
          hop({ id: 'a2', relayId: 'w1', baton: 'reviewer' }),
          hop({ id: 'b2', relayId: 'w2' }),
          hop({ id: 'c2', relayId: 'w3' }),
        ],
      },
      {
        lap: 3,
        hops: [
          hop({ id: 'a3', relayId: 'w1' }),
          hop({ id: 'b3', relayId: 'w2' }),
          hop({ id: 'c3', relayId: 'w3' }),
        ],
      },
    ],
    hails: [hail({ id: 'x1' })],
    status: { word: 'handed-back', reason: null },
    counts: { deliveries: 9, failures: 0, laps: 3, events: 10 },
  })

  const delivered = outcomesFor([
    ...['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a3', 'b3', 'c3'].map(
      (id) => [id, 'delivered'] as [string, RunHistoryOutcome],
    ),
    ['x1', 'handed-back'],
  ])

  /**
   * THE lap canary (R2, made visible). Three correction cycles are ONE run
   * with three lap groups and nine deliveries — not three runs, which is what
   * the old loop law would have produced and what the design deliberately
   * changed.
   *
   * Mutation that reds it: group by flow run id per lap in the backend, or
   * flatten `run.laps` into one group here.
   */
  it('renders three laps as one run of nine deliveries', () => {
    const { laps, calls } = buildRunEvents(threeLaps, {
      resolveName,
      outcomes: delivered,
    })

    expect(laps.map((lap) => lap.lap)).toEqual([1, 2, 3])
    expect(laps.flatMap((lap) => lap.events)).toHaveLength(9)
    expect(laps.map((lap) => lap.deliveries)).toEqual([3, 3, 3])
    expect(calls).toHaveLength(1)
    expect(formatRunSummary(threeLaps)).toBe('One run · 3 laps · 9 deliveries')
  })

  it('labels a lap with the route it declared, or its number alone', () => {
    const { laps } = buildRunEvents(threeLaps, {
      resolveName,
      outcomes: delivered,
    })

    expect(laps[0].label).toBe('Lap 1 · horse')
    expect(laps[1].label).toBe('Lap 2 · reviewer')
    // Nothing declared a route on the third pass, so the number is the label.
    expect(laps[2].label).toBe('Lap 3')
  })

  /**
   * Promise 4: a failure reason nobody can see without clicking is a failure
   * most people never read.
   *
   * Mutation that reds it: drop `reason` from the event row.
   */
  it('carries a failure’s reason on the row itself', () => {
    const failing = run({
      laps: [
        {
          lap: 1,
          hops: [
            hop({
              id: 'h1',
              outcome: 'error',
              error: 'Pi is unavailable. The response was not delivered.',
            }),
          ],
        },
      ],
    })

    const { laps } = buildRunEvents(failing, {
      resolveName,
      outcomes: outcomesFor([['h1', 'delivery-failed']]),
    })

    expect(laps[0].events[0]).toMatchObject({
      outcomeLabel: 'Delivery failed',
      tone: 'alarm',
      reason: 'Pi is unavailable. The response was not delivered.',
    })
  })

  /**
   * A conversation that is genuinely GONE — deleted, not merely out of the
   * crew — still renders, as a row that says so rather than a row that
   * vanished. The other half of this rule, that crew membership is not what
   * names an event, is pinned at the container where the resolver lives.
   *
   * Mutation that reds it: return an empty string for an unnamed recipient —
   * the row reads "Fable → " and the reader cannot tell what happened.
   */
  it('renders an event whose conversation is gone, saying so', () => {
    const orphaned = run({
      laps: [{ lap: 1, hops: [hop({ id: 'h1', targetSessionId: 'ghost' })] }],
    })

    const { laps } = buildRunEvents(orphaned, {
      resolveName,
      outcomes: outcomesFor([['h1', 'delivered']]),
    })

    expect(laps[0].events[0].title).toBe('Fable → a conversation that is gone')
  })

  it('reads a call as the sentence it is', () => {
    const { calls } = buildRunEvents(
      run({ hails: [hail({ id: 'x1', reason: 'stall', sessionId: 'sol' })] }),
      { resolveName, outcomes: outcomesFor([['x1', 'reply-overdue']]) },
    )

    expect(calls[0]).toMatchObject({
      title: 'Sol · reviewer needs you',
      outcomeLabel: 'Reply overdue',
      tone: 'alarm',
    })
  })

  it('names an event the page could not word at all', () => {
    const { laps } = buildRunEvents(
      run({ laps: [{ lap: 1, hops: [hop({ id: 'h1' })] }] }),
      { resolveName, outcomes: {} },
    )

    expect(laps[0].events[0]).toMatchObject({
      outcomeLabel: 'Unknown outcome',
      tone: 'unknown',
    })
  })
})

describe('buildRunHighlight', () => {
  it('names every wire the run used, and only those', () => {
    const highlight = buildRunHighlight(
      run({
        laps: [
          { lap: 1, hops: [hop({ id: 'h1', relayId: 'w1' })] },
          { lap: 2, hops: [hop({ id: 'h2', relayId: 'w1' })] },
        ],
        counts: { deliveries: 2, failures: 0, laps: 2, events: 2 },
      }),
      outcomesFor([
        ['h1', 'delivery-failed'],
        ['h2', 'delivered'],
      ]),
    )

    expect([...highlight.keys()]).toEqual(['w1'])
    // The NEWEST event wins: a wire that failed on lap 1 and delivered on
    // lap 2 is a wire that ended up working, and the failure is still its own
    // row in the list.
    expect(highlight.get('w1')).toMatchObject({
      outcome: 'delivered',
      tone: 'delivered',
      label: 'Lap 2 · delivered',
    })
    expect(highlight.has('w2')).toBe(false)
  })
})

describe('the smaller readers, on their own', () => {
  it('reads an event clock to the second, and refuses an unreadable one', () => {
    // Rows are scanned against their neighbours, so seconds are the unit —
    // two deliveries in one minute must not read as the same moment.
    expect(formatEventTime('2026-09-06T14:32:10.000Z')).toMatch(
      /^\d\d:\d\d:\d\d$/,
    )
    expect(formatEventTime('nonsense')).toBe('--:--:--')
  })

  it('gives a run’s own status the tone its rows wear', () => {
    expect(runTone({ word: 'handed-back', reason: null })).toBe('terminal')
    expect(runTone({ word: 'needs-you', reason: 'failed' })).toBe('alarm')
    expect(runTone({ word: 'running', reason: null })).toBe('delivered')
    expect(runTone({ word: 'finished-quiet', reason: null })).toBe('held')
    // Never red for something this build cannot read.
    expect(runTone({ word: 'unknown', reason: null })).toBe('unknown')
  })

  it('stops telling History a settled hop is still waiting (MAR-2888 lap 3)', () => {
    // Two surfaces read a hop's reason and they were not agreeing: the canvas
    // row learned this in lap 2, History's event row did not, so a `/clear`
    // that waited politely and then landed kept an event row insisting it was
    // waiting. One shared `hopReasonToShow`, so a third surface cannot get it
    // wrong either.
    //
    // The ledger still holds the truth that it waited; what changes is
    // whether a reader is told it still does.
    const waiting = hop({
      id: 'h-waiting',
      outcome: 'queued',
      settledAt: null,
      error: 'Waiting behind a running turn at the target.',
    })
    const landed = hop({
      id: 'h-landed',
      outcome: 'queued',
      settledAt: '2026-09-06T14:33:00.000Z',
      error: 'Waiting behind a running turn at the target.',
    })
    const build = (row: RelayHop) =>
      buildHopEventRow(row, {
        resolveName,
        outcomes: outcomesFor([[row.id, 'queued']]),
      }).reason

    expect(build(waiting)).toBe('Waiting behind a running turn at the target.')
    expect(build(landed)).toBeNull()
    // An event's own record survives settling: only a state sentence expires.
    expect(
      build(
        hop({
          id: 'h-broke',
          outcome: 'error',
          settledAt: '2026-09-06T14:33:00.000Z',
          error: 'Pi is unavailable. The response was not delivered.',
        }),
      ),
    ).toBe('Pi is unavailable. The response was not delivered.')
  })

  it('builds one hop row and one call row on their own', () => {
    expect(
      buildHopEventRow(hop({ id: 'h1' }), {
        resolveName,
        outcomes: outcomesFor([['h1', 'queued']]),
      }),
    ).toMatchObject({
      kind: 'hop',
      title: 'Fable → Opus',
      outcomeLabel: 'Queued',
      relayId: 'wire-a',
    })

    expect(
      buildHailEventRow(hail({ id: 'x1' }), {
        resolveName,
        outcomes: outcomesFor([['x1', 'handed-back']]),
      }),
    ).toMatchObject({
      kind: 'hail',
      title: 'Fable handed the run back to you',
      // A call is not a wire: there is nothing to open a connection for.
      relayId: null,
    })
  })
})

describe('appendRunPage', () => {
  const page = (
    runs: RelayRun[],
    hasMore: boolean,
    outcomes: Record<string, RunHistoryOutcome> = {},
  ): RelayRunPage => ({
    runs,
    unattributedHails: [],
    outcomes,
    hasMore,
    nextCursor: null,
  })

  /**
   * L2. The older page joins the bottom of the list, and the page that saw
   * the bottom owns `hasMore` -- otherwise the row offering more never goes
   * away.
   *
   * Mutation that reds it: keep the current page's `hasMore`, or replace the
   * runs instead of appending.
   */
  it('joins the older page onto the bottom and takes its hasMore', () => {
    const joined = appendRunPage(
      page([run({ flowRunId: 'run-1' }), run({ flowRunId: 'run-2' })], true, {
        h1: 'delivered',
      }),
      page([run({ flowRunId: 'run-3' })], false, { h9: 'handed-back' }),
    )

    expect(joined.runs.map((entry) => entry.flowRunId)).toEqual([
      'run-1',
      'run-2',
      'run-3',
    ])
    expect(joined.hasMore).toBe(false)
    expect(joined.outcomes).toEqual({ h1: 'delivered', h9: 'handed-back' })
  })

  /**
   * A wire firing mid-read can push a run the caller already holds into the
   * page below it, and one run listed twice reads as two attempts.
   *
   * Mutation that reds it: concatenate without the id check.
   */
  it('never lists a run it already holds twice', () => {
    const joined = appendRunPage(
      page([run({ flowRunId: 'run-1' })], true),
      page([run({ flowRunId: 'run-1' }), run({ flowRunId: 'run-2' })], false),
    )

    expect(joined.runs.map((entry) => entry.flowRunId)).toEqual([
      'run-1',
      'run-2',
    ])
  })
})

describe('L-vi delivery-bearing display laps', () => {
  const record = run({
    laps: [
      { lap: 1, hops: [hop({ id: 'delivery' })] },
      {
        lap: 2,
        hops: [hop({ id: 'held', outcome: 'skipped-baton', lapNumber: 2 })],
      },
    ],
    status: { word: 'handed-back', reason: null },
    counts: { deliveries: 1, failures: 0, laps: 2, events: 2 },
  })
  const outcomes = { delivery: 'delivered', held: 'held' } as const
  it.each(['status', 'summary', 'group', 'highlight'] as const)(
    'corrects the %s (mutation: use ledger laps directly)',
    (proof) => {
      if (proof === 'status')
        expect(formatRunStatusLine(record)).toBe('Handed back')
      if (proof === 'summary')
        expect(formatRunSummary(record)).toBe('2 recorded events')
      if (proof === 'group')
        expect(
          buildRunEvents(record, { resolveName, outcomes }).laps.map((lap) =>
            lap.events.map((event) => event.id),
          ),
        ).toEqual([['delivery', 'held']])
      if (proof === 'highlight')
        expect(buildRunHighlight(record, outcomes).get('wire-a')?.label).toBe(
          'Held',
        )
    },
  )
})

it('RUN66 R3 folds held siblings after delivery only — mutation fold without a sibling delivery turns red', () => {
  const delivered = hop({
    id: 'delivery',
    settleId: 'settle',
    baton: 'studio horse astra',
    payloadPreview: 'The brief',
    firedAt: '2026-09-10T10:19:00.100Z',
  })
  const held = [1, 2, 3, 4].map((n) =>
    hop({
      id: 'held-' + n,
      settleId: 'settle',
      outcome: 'skipped-baton',
      targetSessionId: 'sol',
      error: 'Different baton',
      firedAt: '2026-09-10T10:19:00.200Z',
    }),
  )
  const parked = held.map((h) => ({
    ...h,
    id: 'park-' + h.id,
    settleId: 'parked',
    firedAt: '2026-09-10T10:20:00.200Z',
  }))
  const otherSource = {
    ...held[0],
    id: 'other-source',
    sourceSessionId: 'sol',
    settleId: 'other',
  }
  const hops = [held[0], delivered, ...held.slice(1), ...parked, otherSource]
  const groups = buildRunEvents(run({ laps: [{ lap: 1, hops }] }), {
    resolveName,
    outcomes: Object.fromEntries(
      hops.map((h) => [h.id, h.id === 'delivery' ? 'delivered' : 'held']),
    ),
  })
  expect(
    groups.laps[0].events.map((e) => ({
      id: e.id,
      title: e.title,
      reason: e.reason,
      preview: e.preview,
    })),
  ).toEqual([
    {
      id: 'delivery',
      title: 'Fable → Opus',
      reason: null,
      preview: 'The brief',
    },
    {
      id: 'held:delivery',
      title: '4 wires held — the message went to studio horse astra',
      reason: Array(4).fill('Sol · reviewer: Different baton').join('; '),
      preview: null,
    },
    ...parked.map((h) => ({
      id: h.id,
      title: 'Fable → Sol · reviewer',
      reason: 'Different baton',
      preview: null,
    })),
    {
      id: 'other-source',
      title: 'Sol · reviewer → Sol · reviewer',
      reason: 'Different baton',
      preview: null,
    },
  ])
})

it.each(['shared', 'distinct', 'legacy'] as const)(
  'RUN66 round2 fold uses recorded settle only: %s — mutation use clock or fold NULLs turns red',
  (kind) => {
    const rows = ['held-a', 'delivery', 'held-b'].map((id, index) =>
      hop({
        id,
        outcome: id === 'delivery' ? 'delivered' : 'skipped-baton',
        firedAt:
          kind === 'shared'
            ? `2026-09-10T10:19:0${index}.000Z`
            : '2026-09-10T10:19:00.100Z',
        settleId:
          kind === 'shared' ? 'settle' : kind === 'distinct' ? id : null,
      }),
    )
    const events = buildRunEvents(run({ laps: [{ lap: 1, hops: rows }] }), {
      resolveName,
      outcomes: { 'held-a': 'held', delivery: 'delivered', 'held-b': 'held' },
    }).laps[0].events
    expect(events.map((e) => e.id)).toEqual(
      kind === 'shared'
        ? ['delivery', 'held:delivery']
        : rows.map((row) => row.id),
    )
  },
)
