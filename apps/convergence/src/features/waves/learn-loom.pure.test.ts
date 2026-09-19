import { describe, expect, it } from 'vitest'
import {
  learnLoomAnnouncement,
  learnLoomLiveMessage,
  learnLoomMotionStyle,
  learnLoomMoves,
  LEARN_LOOM_MOTION,
  learnLoomSheetStride,
  learnLoomTicketLeft,
  learnLoomTicketMaxWidth,
  LEARN_LOOM_GEOMETRY,
  learnLoomSheetViews,
  learnLoomStepAt,
  learnLoomStepView,
  LEARN_LOOM_FIRST_STEP,
  LEARN_LOOM_STEPS,
  LEARN_LOOM_STEP_COUNT,
} from './learn-loom.pure'
import { LEARN_LOOM_STEP_COPY } from './learn-loom-copy.pure'
import { loomSheetTitle } from './loom-sheets.pure'
import { LOOM_SHEETS } from './wave-panel-sheet.pure'

describe('MAR-3201 R1: the lesson is the handoff’s table', () => {
  it('six steps, in order, with the sheet and words each one teaches', () => {
    expect(
      LEARN_LOOM_STEPS.map((step) => [
        step.key,
        step.activeSheet,
        step.ticketStatus,
        step.emphasis,
      ]),
    ).toEqual([
      ['prepare', 'plan', 'Brief → code check', 'blue'],
      ['assign', 'next', '1 · ready', 'blue'],
      ['work', 'now', 'Linear: In Progress', 'blue'],
      ['review', 'now', 'Fable’s turn · Linear: In Review', 'blue'],
      ['accept', 'now', 'Awaiting QA · Linear: Reviewed', 'amber'],
      ['history', 'before', 'Linear: Done', 'green'],
    ])
    expect(LEARN_LOOM_STEP_COUNT).toBe(6)
    expect(LEARN_LOOM_STEPS.map((step) => step.index)).toEqual([
      0, 1, 2, 3, 4, 5,
    ])
  })

  it('the ticket never leaves Now while it is reviewed or accepted', () => {
    // Mutation: review's sheet -> `next` -> red. The lesson's point is that
    // In Review and Reviewed are both still Now; moving the card teaches the
    // opposite of what the words say.
    const onNow = LEARN_LOOM_STEPS.filter((step) => step.activeSheet === 'now')
    expect(onNow.map((step) => step.key)).toEqual(['work', 'review', 'accept'])
  })

  it('every count a row does not name is zero', () => {
    const counts = LEARN_LOOM_STEPS.map((step) => step.counts)
    expect(counts[0]).toEqual({
      before: 0,
      open: 0,
      awaitingQa: 0,
      next: 0,
      nextReady: 0,
      nextPreparing: 0,
      plan: 1,
    })
    // Accept is the one step where Now's two numbers differ from Work's.
    expect([counts[2]!.open, counts[2]!.awaitingQa]).toEqual([1, 0])
    expect([counts[3]!.open, counts[3]!.awaitingQa]).toEqual([1, 0])
    expect([counts[4]!.open, counts[4]!.awaitingQa]).toEqual([0, 1])
    expect(counts[5]!.before).toBe(1)
  })
})

describe('MAR-3201 R2: the titles are the app’s own sentences', () => {
  it('shows the name once, with compact counts on closed sheets', () => {
    const prepare = learnLoomSheetViews(LEARN_LOOM_STEPS[0]!)
    expect(prepare.map((sheet) => sheet.countLabel)).toEqual([
      '0 done',
      '0 open\n0 awaiting QA',
      '0 ready',
      '1 in preparation',
    ])
    const accept = learnLoomSheetViews(LEARN_LOOM_STEPS[4]!)
    expect(accept.find((sheet) => sheet.sheet === 'now')!.countLabel).toBe(
      '0 open · 1 awaiting QA',
    )
  })

  it('each sheet title is what loomSheetTitle says for that step', () => {
    for (const step of LEARN_LOOM_STEPS) {
      const views = learnLoomSheetViews(step)
      // Mutation: hard-code the four strings -> when the app's format
      // changes, this comparison is the thing that goes red.
      expect(views.map((view) => view.title)).toEqual(
        LOOM_SHEETS.map((sheet) => loomSheetTitle(sheet, step.counts)),
      )
      expect(views.map((view) => view.sheet)).toEqual([...LOOM_SHEETS])
      expect(views.filter((view) => view.active)).toHaveLength(1)
    }
  })

  it('the words a person reads at the two ends of the lesson', () => {
    const first = learnLoomSheetViews(LEARN_LOOM_STEPS[0]!)
    expect(first.map((view) => view.title)).toEqual([
      'Before · 0 done',
      'Now · 0 open · 0 awaiting QA',
      'Next · 0 ready',
      'Plan · 1 in preparation',
    ])
    const accept = learnLoomSheetViews(LEARN_LOOM_STEPS[4]!)
    expect(accept[1]!.title).toBe('Now · 0 open · 1 awaiting QA')
  })
})

describe('MAR-3201 R5: where a press lands', () => {
  it('clamps at both ends, and never wraps', () => {
    expect(learnLoomStepAt(-4)).toBe(0)
    expect(learnLoomStepAt(0)).toBe(0)
    expect(learnLoomStepAt(3)).toBe(3)
    expect(learnLoomStepAt(5)).toBe(5)
    // Mutation: wrap with a modulo -> the last Next jumps back to Prepare.
    expect(learnLoomStepAt(6)).toBe(5)
    expect(learnLoomStepAt(99)).toBe(5)
    expect(learnLoomStepAt(Number.NaN)).toBe(LEARN_LOOM_FIRST_STEP)
  })

  it('Back is dead only on the first step; only the last one closes', () => {
    expect(learnLoomStepView(0).backDisabled).toBe(true)
    expect(learnLoomStepView(1).backDisabled).toBe(false)
    expect(learnLoomStepView(5).isLast).toBe(true)
    expect(learnLoomStepView(4).isLast).toBe(false)
  })
})

describe('MAR-3201 lap 3, F: one geometry, everything else derived', () => {
  it('the ticket sits one inset inside the active sheet, at every step', () => {
    const { closedWidth, overlap, ticketInset } = LEARN_LOOM_GEOMETRY
    for (const [at] of LOOM_SHEETS.entries()) {
      // Computed from the four numbers, never from the `112` they happen to
      // make today: changing `closedWidth` alone must move this with it.
      expect(learnLoomTicketLeft(at)).toBe(
        at * (closedWidth - overlap) + ticketInset,
      )
    }
    expect(learnLoomSheetStride()).toBe(closedWidth - overlap)
    // Mutation: use `closedWidth` as the stride (forget the overlap) -> the
    // ticket drifts further right with every step, red.
    expect(learnLoomTicketLeft(0)).toBe(ticketInset)
    expect(learnLoomTicketLeft(3) - learnLoomTicketLeft(2)).toBe(
      learnLoomSheetStride(),
    )
  })

  // LL3 changed this assertion's expected string, and only its string: the
  // clamp is still the same four numbers with the same arithmetic, now
  // floored at zero so it survives an illustration narrower than its own
  // cost. The old form is asserted absent below, because a bare `calc` that
  // goes negative is not a smaller clamp -- it is no clamp at all.
  it('the clamp leaves the active sheet its insets on both sides', () => {
    const { closedWidth, overlap, ticketInset } = LEARN_LOOM_GEOMETRY
    const closed = (LOOM_SHEETS.length - 1) * (closedWidth - overlap)
    expect(learnLoomTicketMaxWidth(LOOM_SHEETS.length)).toBe(
      `max(0px, calc(100% - ${closed + 2 * ticketInset}px))`,
    )
  })

  it('MAR-3203: and it never resolves negative, at any width', () => {
    // The literal the browser is handed, written out rather than rebuilt
    // from the module under test: 3 x 112 + 2 x 18.
    expect(learnLoomTicketMaxWidth(LOOM_SHEETS.length)).toBe(
      'max(0px, calc(100% - 372px))',
    )
    // Mutation: drop the `max(0px, ` floor -> red here, on a clamp that a
    // browser discards outright once `100%` falls under 372 px.
    expect(learnLoomTicketMaxWidth(LOOM_SHEETS.length)).toContain('max(0px')
    // The floor is a floor, not a replacement: the derived cost is still in
    // the string, so a ticket that has room is still clamped by the sheets.
    expect(learnLoomTicketMaxWidth(LOOM_SHEETS.length)).toContain('372px')
    // And it is derived, not pasted: more sheets cost more, still floored.
    expect(learnLoomTicketMaxWidth(6)).toBe('max(0px, calc(100% - 596px))')
  })
})

describe('MAR-3201 R7: the step is said, not only shown', () => {
  it('names the position and the step’s own title', () => {
    expect(learnLoomAnnouncement(0)).toBe(
      'Step 1 of 6: Turn an idea into work an agent can do.',
    )
    expect(learnLoomAnnouncement(4)).toBe(
      'Step 5 of 6: Reviewed means it’s your turn.',
    )
    // Pasted, not read from the module: an assertion that builds its own
    // expectation from the code under test cannot fail.
    expect(learnLoomAnnouncement(2)).toBe(
      'Step 3 of 6: Watch the work, not just the spinner.',
    )
  })

  it('says the ticket’s status and its sheet, for both views', () => {
    // The status words are the reason colour is never the only carrier, and
    // they live inside an `aria-hidden` illustration (lap 3, D).
    expect(learnLoomLiveMessage('steps', 0)).toBe(
      'Step 1 of 6: Turn an idea into work an agent can do. Brief → code check. Plan · 1 in preparation.',
    )
    expect(learnLoomLiveMessage('steps', 5)).toBe(
      'Step 6 of 6: Accepted work becomes Before. Linear: Done. Before · 1 done.',
    )
    // Mutation: return the steps sentence for the reference too -> red.
    expect(learnLoomLiveMessage('reference', 3)).toBe('Loom, at a glance')
  })

  it('the view carries the step’s own copy', () => {
    const view = learnLoomStepView(3)
    expect(view.copy).toBe(LEARN_LOOM_STEP_COPY[3])
    expect(view.step).toBe(LEARN_LOOM_STEPS[3])
    expect(view.announcement).toBe(learnLoomAnnouncement(3))
  })
})

describe('MAR-3202 R1: one timing, one curve, one source', () => {
  it('is the handoff’s 350 ms and Figma’s EASE_IN_AND_OUT', () => {
    // Pasted from the frozen handoff's motion table, not imported from the
    // module under test: `350 ms, Figma EASE_IN_AND_OUT; web equivalent
    // ease-in-out / cubic-bezier(0.42,0,0.58,1)`.
    expect(LEARN_LOOM_MOTION.durationMs).toBe(350)
    expect(LEARN_LOOM_MOTION.easing).toBe('cubic-bezier(0.42, 0, 0.58, 1)')
  })

  it('reaches CSS as exactly those two values and nothing else', () => {
    // The style is the ONLY road from the constant to the screen, so a
    // constant the elements do not actually carry is a constant that lies.
    // Mutation: hard-code `350ms` here instead of reading the constant ->
    // the two assertions below still agree, so they are written against
    // `LEARN_LOOM_MOTION` itself and the one above pins its value.
    expect(learnLoomMotionStyle()).toEqual({
      '--learn-loom-duration': `${LEARN_LOOM_MOTION.durationMs}ms`,
      '--learn-loom-easing': LEARN_LOOM_MOTION.easing,
    })
    // No delay rides along: a stagger is the one thing the handoff forbids
    // by name, and it could only arrive as a third property here.
    expect(Object.keys(learnLoomMotionStyle())).toHaveLength(2)
  })
})

describe('MAR-3202 R3: the ticket moves only when its sheet changes', () => {
  it('every adjacent pair, in both directions', () => {
    // The handoff's table, read as places rather than as beats: Work, Review
    // and Accept are all `now`.
    const EXPECTED: readonly [number, number, boolean][] = [
      [0, 1, true], // prepare -> assign: plan -> next
      [1, 2, true], // assign -> work: next -> now
      [2, 3, false], // work -> review: both now
      [3, 4, false], // review -> accept: both now
      [4, 5, true], // accept -> history: now -> before
    ]
    for (const [from, to, moves] of EXPECTED) {
      expect(learnLoomMoves(from, to), `${from} -> ${to}`).toBe(moves)
      expect(learnLoomMoves(to, from), `${to} -> ${from}`).toBe(moves)
    }
  })

  it('is the active sheet’s question, not the index’s', () => {
    // Mutation: `return from !== to` -> both of these flip, red. The second
    // is the one an index can never get right: two steps apart and still
    // the same place in Loom.
    expect(learnLoomMoves(2, 4)).toBe(false)
    expect(learnLoomMoves(3, 3)).toBe(false)
    // ... and a step cannot be said to move to itself.
    expect(learnLoomMoves(0, 0)).toBe(false)
  })

  it('clamps like every other reader of a step index', () => {
    // Out of range lands on the first step, so a stray index cannot claim a
    // move that the guide would never draw.
    expect(learnLoomMoves(-4, 0)).toBe(false)
    expect(learnLoomMoves(99, 5)).toBe(false)
  })
})
