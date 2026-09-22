import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { LearnLoomGuide } from './learn-loom.container'
import {
  LEARN_LOOM_CONTROLS,
  LEARN_LOOM_REFERENCE_CARDS,
  LEARN_LOOM_TICKET,
} from './learn-loom-copy.pure'
import { loomSheetTitle } from './loom-sheets.pure'
import {
  learnLoomMoves,
  learnLoomTicketLeft,
  LEARN_LOOM_GEOMETRY,
  LEARN_LOOM_MOTION,
  LEARN_LOOM_STEPS,
} from './learn-loom.pure'
import { LOOM_SHEETS } from './wave-panel-sheet.pure'

/**
 * The guide, rendered (the MAR-2280 law). The copy here is pasted from the
 * frozen handoff's "Exact selected copy", not imported from the module it is
 * meant to be checking.
 */

afterEach(cleanup)

const open = () => render(<LearnLoomGuide open onClose={() => {}} />)

const dialog = () => screen.getByRole('dialog')
const ticket = () =>
  document.querySelector(
    `[data-learn-loom-ticket="${LEARN_LOOM_TICKET.identifier}"]`,
  ) as HTMLElement
const next = () =>
  screen.getByRole('button', { name: /^Next: |^Back to Loom$/ })
const press = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole('button', { name }))

const advanceTo = (step: number) => {
  for (let at = 0; at < step; at += 1) fireEvent.click(next())
}

describe('MAR-3201 R4: the copy is r1’s, exactly', () => {
  const EXPECTED = [
    {
      index: '1 / 6',
      label: 'PREPARE',
      title: 'Turn an idea into work an agent can do.',
      main: 'You and your mastermind shape the brief, then check it against today’s code. In this crew, the mastermind is Fable.',
      key: 'Groomed = understood. Grounded = checked in code.',
      explanation:
        'Grounding has a date. After seven days, Loom flags it as expired; ask the mastermind to check it again.',
      part: 'Explain the outcome and how you’ll accept it.',
      primary: 'Next: assign a horse →',
    },
    {
      index: '2 / 6',
      label: 'ASSIGN',
      title: 'Choose the right horse for the work.',
      main: 'Assign a seat with the tools and host this ticket needs. Its queue appears in Next; missing preparation is named there.',
      key: 'Ready = groomed + grounded + dispatch.',
      explanation:
        'The seat must have a conversation. With Auto-dispatch off, Fable still hands off work; with it on, the app sends a ready ticket into its seat.',
      part: 'Agree the assignment with your mastermind or in Linear.',
      primary: 'Next: start the work →',
    },
    {
      index: '3 / 6',
      label: 'WORK',
      title: 'Watch the work, not just the spinner.',
      main: 'When the horse picks up the issue, its ticket becomes In Progress. Look in Now for the horse, its host and the issue it holds.',
      key: 'Horse activity and ticket status are different.',
      explanation:
        'Working, Idle and Failed describe the agent’s turn. In Progress describes the ticket. An idle horse can still hold unfinished work.',
      part: 'Open the ticket, PR or linked conversation for context.',
      primary: 'Next: review the result →',
    },
    {
      index: '4 / 6',
      label: 'REVIEW',
      title: 'The horse returns. Fable reviews.',
      main: 'The horse reports its work and verification evidence. In Review means the result is waiting for the mastermind’s verdict.',
      key: 'PASS continues. RETURN means another lap. STOP means rethink.',
      explanation:
        'A lap is one execution-and-review round. Corrections return to the horse; stopped work goes back to Plan for re-grooming.',
      part: 'Fable’s turn is still open work, not your QA queue.',
      primary: 'Next: your acceptance →',
    },
    {
      index: '5 / 6',
      label: 'ACCEPT',
      title: 'Reviewed means it’s your turn.',
      main: 'Fable passed the work. It appears in Now → Awaiting QA with Linear status Reviewed. You decide whether it meets the brief.',
      key: 'Reviewed is waiting for you. Done means you accepted it.',
      explanation:
        'Check the linked PR or release before testing. Follow the issue’s QA steps; tell your mastermind what passed or what needs fixing.',
      part: 'Accept and say “done”, or send back specific feedback.',
      primary: 'Next: completed work →',
    },
    {
      index: '6 / 6',
      label: 'HISTORY',
      title: 'Accepted work becomes Before.',
      main: 'Once the issue is marked Done in Linear, Loom places it in Before, grouped by wave. Tickets without a wave appear under No wave.',
      key: 'A wave groups related tickets. It does not start them.',
      explanation:
        'Before is recent history with a 14-day display window. Done records acceptance; a merged PR and a published release are separate facts.',
      part: 'Reopen this guide from “How Loom works” whenever you need it.',
      primary: 'Back to Loom',
    },
  ]

  /** Pasted, not imported: a test that reads the module cannot check it. */
  const TICKET_STATUS = [
    'Brief → code check',
    '1 · ready',
    'Linear: In Progress',
    'Fable’s turn · Linear: In Review',
    'Awaiting QA · Linear: Reviewed',
    'Linear: Done',
  ]

  it('every word of every step, and the ticket’s status line', () => {
    open()
    for (const [at, step] of EXPECTED.entries()) {
      // Mutation: change one word in the copy module -> red.
      expect(screen.getByText(step.index)).toBeTruthy()
      expect(screen.getByText(step.label)).toBeTruthy()
      expect(screen.getByRole('heading', { name: step.title })).toBeTruthy()
      expect(screen.getByText(step.main)).toBeTruthy()
      expect(screen.getByText(step.key)).toBeTruthy()
      expect(screen.getByText(step.explanation)).toBeTruthy()
      expect(screen.getByText('YOUR PART')).toBeTruthy()
      expect(screen.getByText(step.part)).toBeTruthy()
      expect(screen.getByRole('button', { name: step.primary })).toBeTruthy()
      expect(within(ticket()).getByText(TICKET_STATUS[at]!)).toBeTruthy()
      if (at < EXPECTED.length - 1) fireEvent.click(next())
    }
  })

  it('the quick reference’s line and its six cards', () => {
    open()
    press(LEARN_LOOM_CONTROLS.reference)
    expect(
      screen.getByRole('dialog', { name: 'Loom, at a glance' }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'One shared plan. Agents do the work. You accept the result.',
      ),
    ).toBeTruthy()
    const titles = [
      'Where to look',
      'Who does what',
      'Read the ticket status',
      'Read the labels',
      'When work needs attention',
      'What you can do today',
    ]
    expect(
      [...document.querySelectorAll('[data-learn-loom-card]')].map((card) =>
        card.getAttribute('data-learn-loom-card'),
      ),
    ).toEqual(titles)
    expect(
      screen.getByText('Plan: shape the work. Next: assigned queues.'),
    ).toBeTruthy()
    expect(screen.getByText('In Review → Fable’s turn.')).toBeTruthy()
    expect(
      screen.getByText(
        'STOP: re-groom in Plan. blocked: Decide in Now. “Not seen” means no observation.',
      ),
    ).toBeTruthy()
    expect(LEARN_LOOM_REFERENCE_CARDS).toHaveLength(6)
  })
})

describe('MAR-3201 R3: one ticket, one identity', () => {
  it('the same DOM node travels the whole lesson', () => {
    open()
    const first = ticket()
    expect(document.querySelectorAll('[data-learn-loom-ticket]')).toHaveLength(
      1,
    )
    fireEvent.click(next())
    // Mutation: key the ticket by step (or render it inside the active
    // sheet, which React cannot reparent) -> a new node here, red.
    expect(ticket()).toBe(first)
    advanceTo(4)
    expect(ticket()).toBe(first)
    expect(document.querySelectorAll('[data-learn-loom-ticket]')).toHaveLength(
      1,
    )
  })

  it('its identity never changes; only its status does', () => {
    open()
    for (let at = 0; at < 6; at += 1) {
      const card = within(ticket())
      expect(card.getByText('DEMO-101')).toBeTruthy()
      expect(card.getByText('Improve account setup')).toBeTruthy()
      expect(card.getByText('Illustrative ticket')).toBeTruthy()
      if (at < 5) fireEvent.click(next())
    }
  })
})

describe('MAR-3201 R2: the illustration speaks the app’s count language', () => {
  it('at Accept, Now’s title is what the app would say', () => {
    open()
    advanceTo(4)
    const sheets = [...document.querySelectorAll('[data-learn-loom-sheet]')]
    expect(sheets.map((s) => s.getAttribute('data-learn-loom-sheet'))).toEqual([
      'before',
      'now',
      'next',
      'plan',
    ])
    const now = sheets[1]!
    expect(now.getAttribute('data-learn-loom-active')).toBe('true')
    // Compared against the app's own function, not a pasted string.
    expect(now.getAttribute('aria-label')).toBe(
      loomSheetTitle('now', LEARN_LOOM_STEPS[4]!.counts),
    )
    expect(now.textContent).toBe('Now0 open · 1 awaiting QA')
  })

  it('the active sheet is the step’s, and only one is active', () => {
    open()
    const activeName = () =>
      document
        .querySelector('[data-learn-loom-active="true"]')
        ?.getAttribute('data-learn-loom-sheet')
    expect(activeName()).toBe('plan')
    fireEvent.click(next())
    expect(activeName()).toBe('next')
    fireEvent.click(next())
    expect(activeName()).toBe('now')
    advanceTo(3)
    expect(activeName()).toBe('before')
    expect(
      document.querySelectorAll('[data-learn-loom-active="true"]'),
    ).toHaveLength(1)
  })
})

describe('MAR-3201 R5: navigation', () => {
  it('Back refuses on the first step without losing the keyboard', () => {
    open()
    const back = () =>
      screen.getByRole('button', { name: LEARN_LOOM_CONTROLS.back })
    expect(back().getAttribute('aria-disabled')).toBe('true')
    // Never the attribute: a `disabled` element drops the focus standing on
    // it, which is what happens to a keyboard user pressing Back on step 2.
    // Mutation: `disabled={step.backDisabled}` -> red.
    expect(back().hasAttribute('disabled')).toBe(false)

    fireEvent.click(next())
    expect(back().getAttribute('aria-disabled')).toBeNull()
    back().focus()
    fireEvent.click(back())
    expect(screen.getByText('1 / 6')).toBeTruthy()
    // Back disabled ITSELF, and the keyboard is still on it.
    expect(document.activeElement).toBe(back())
    expect(back().getAttribute('aria-disabled')).toBe('true')

    // A further press does nothing at all.
    fireEvent.click(back())
    expect(screen.getByText('1 / 6')).toBeTruthy()
    expect(document.activeElement).toBe(back())
  })

  it('a burst of presses lands on the arithmetic result, and closes nothing', () => {
    const onClose = vi.fn()
    render(<LearnLoomGuide open onClose={onClose} />)
    // Eight presses inside ONE act: React batches them, so only a functional
    // update can walk the whole lesson. Mutation: `setStep(step + 1)` -> all
    // eight read the same rendered step and land on `2 / 6`, red.
    act(() => {
      for (let at = 0; at < 8; at += 1) next().click()
    })
    expect(screen.getByText('6 / 6')).toBeTruthy()
    // Nothing in a burst closes the guide, whatever step it runs through.
    expect(onClose).not.toHaveBeenCalled()

    for (let at = 0; at < 2; at += 1) {
      fireEvent.click(
        screen.getByRole('button', { name: LEARN_LOOM_CONTROLS.back }),
      )
    }
    expect(screen.getByText('4 / 6')).toBeTruthy()
    expect(document.querySelectorAll('[data-learn-loom-ticket]')).toHaveLength(
      1,
    )
    expect(
      screen.getByRole('heading', {
        name: 'The horse returns. Fable reviews.',
      }),
    ).toBeTruthy()
    expect(
      within(ticket()).getByText('Fable’s turn · Linear: In Review'),
    ).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()

    // The last step's primary control does close, exactly once.
    fireEvent.click(next())
    fireEvent.click(next())
    expect(screen.getByText('6 / 6')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Loom' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Quick reference opens from any step, and restart goes to step one', () => {
    open()
    advanceTo(3)
    press(LEARN_LOOM_CONTROLS.reference)
    expect(document.querySelector('[data-learn-loom-reference]')).toBeTruthy()
    press(LEARN_LOOM_CONTROLS.restart)
    // Mutation: resume the step it left -> `4 / 6` here, red.
    expect(screen.getByText('1 / 6')).toBeTruthy()
    expect(document.querySelector('[data-learn-loom-reference]')).toBeNull()
  })
})

describe('MAR-3201 lap 3, G: the three looks', () => {
  it('G1: the headline and its explanation are one filled card', () => {
    open()
    const card = document.querySelector('[data-learn-loom-key]') as HTMLElement
    // Mutation: render them as bare paragraphs again -> no fill, red.
    expect(card.className).toContain('bg-card')
    expect(card.className).toContain('rounded-[10px]')
    expect(
      within(card).getByText(
        'Groomed = understood. Grounded = checked in code.',
      ),
    ).toBeTruthy()
    expect(
      within(card).getByText(
        'Grounding has a date. After seven days, Loom flags it as expired; ask the mastermind to check it again.',
      ),
    ).toBeTruthy()
    // YOUR PART stays outside it.
    expect(within(card).queryByText('YOUR PART')).toBeNull()
  })

  it('lap 4, G2 + G3: two borders carry the step’s colour, and nothing else does', () => {
    open()
    const eyebrow = () =>
      document.querySelector('[data-learn-loom-step] p') as HTMLElement
    const identifier = () => within(ticket()).getByText('DEMO-101')
    const status = () => within(ticket()).getByText(/Brief|Awaiting QA|Done/)
    const activeSheet = () =>
      document.querySelector('[data-learn-loom-active="true"]') as HTMLElement

    // Read off nodes 559:810/841/834/840, 559:1810/1841/1820/1840 and
    // 559:2060/2091/2064/2090: the eyebrow and the identifier are the SAME
    // blue on all six steps, and only the active sheet's border and the
    // ticket's move. Mutation: colour the eyebrow by emphasis -> red on the
    // amber step.
    expect(eyebrow().className).toContain('text-blue-500')
    expect(identifier().className).toContain('text-blue-500')
    expect(activeSheet().className).toContain('border-blue-500')
    expect(ticket().className).toContain('border-blue-500')
    // The status line says the change in words, never in hue (R7).
    expect(status().className).toContain('text-foreground')

    // Amber when it is waiting on a person.
    advanceTo(4)
    expect(eyebrow().className).toContain('text-blue-500')
    expect(identifier().className).toContain('text-blue-500')
    expect(activeSheet().className).toContain('border-amber-400')
    expect(ticket().className).toContain('border-amber-400')
    expect(status().className).toContain('text-foreground')

    // Green when it is accepted.
    advanceTo(1)
    expect(eyebrow().className).toContain('text-blue-500')
    expect(identifier().className).toContain('text-blue-500')
    expect(activeSheet().className).toContain('border-emerald-500')
    expect(ticket().className).toContain('border-emerald-500')
    expect(status().className).toContain('text-foreground')
  })

  it('lap 4, G3: the ticket reads in the frames’ order, and the icons are the stack’s', () => {
    open()
    // Nodes 559:841-844, top to bottom: identifier, title, status, note.
    // Mutation: put the note back at the top -> red.
    const lines = Array.from(ticket().querySelectorAll('p')).map(
      (line) => line.textContent,
    )
    expect(lines).toEqual([
      'DEMO-101',
      'Improve account setup',
      'Brief → code check',
      'Illustrative ticket',
    ])

    // 559:815 is emerald and 559:821 is sky -- the real stack's own colours,
    // which both surfaces now read from one map.
    // Mutation: hardcode the icons muted in the guide -> red.
    const icon = (sheet: string) =>
      document.querySelector(
        `[data-learn-loom-sheet="${sheet}"] svg`,
      ) as SVGElement
    expect(icon('before').getAttribute('class')).toContain('text-emerald-500')
    expect(icon('now').getAttribute('class')).toContain('text-sky-400')
  })

  it('G3: the ticket’s note is sentence case, and the reference leads larger', () => {
    open()
    const note = within(ticket()).getByText('Illustrative ticket')
    // Mutation: restore `uppercase` -> red. The words are a note about the
    // card, not a label stamped on it.
    expect(note.className).not.toContain('uppercase')
    expect(note.className).toContain('text-muted-foreground')

    press(LEARN_LOOM_CONTROLS.reference)
    const lead = screen.getByText(
      'One shared plan. Agents do the work. You accept the result.',
    )
    expect(lead.className).toContain('text-[19px]')
    expect(lead.className).toContain('font-semibold')
  })
})

describe('MAR-3201 R7 + R10: a modal, accessibly, that does not move', () => {
  it('role, name, and one live region that follows both views', () => {
    open()
    expect(screen.getByRole('dialog', { name: 'How Loom works' })).toBeTruthy()
    expect(dialog().getAttribute('aria-modal')).toBe('true')
    const live = () => document.querySelector('[data-learn-loom-live]')!
    expect(live().getAttribute('aria-live')).toBe('polite')
    // Where you are, what the ticket says now, and which sheet that is --
    // the status words live here because the illustration is aria-hidden.
    // Mutation: remove the live region, or drop the status words -> red.
    expect(live().textContent).toBe(
      'Step 1 of 6: Turn an idea into work an agent can do. Brief → code check. Plan · 1 in preparation.',
    )
    advanceTo(4)
    expect(live().textContent).toBe(
      'Step 5 of 6: Reviewed means it’s your turn. Awaiting QA · Linear: Reviewed. Now · 0 open · 1 awaiting QA.',
    )
    // Entering the quick reference is a change of place, and it is said.
    // Mutation: move the region back inside the steps branch -> red.
    press(LEARN_LOOM_CONTROLS.reference)
    expect(live().textContent).toBe('Loom, at a glance')
  })

  it('exactly one close control, and it is the design’s', () => {
    open()
    // `hideClose` turns off the primitive's corner ×; the guide brings its
    // own. Mutation: drop `hideClose` -> two closes, red.
    expect(screen.getAllByRole('button', { name: 'Close ×' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  // Named for what it proves: jsdom has no layout, so "the footer does not
  // jump" is Marcin's eyes. What is checked here is that it is outside the
  // one region allowed to grow.
  it('the footer is outside the scrolling body, in every step', () => {
    open()
    const footer = () => document.querySelector('[data-learn-loom-footer]')!
    expect(dialog().lastElementChild).toBe(footer())
    const positionOf = () => [...dialog().children].indexOf(footer() as Element)
    const first = positionOf()
    advanceTo(5)
    expect(dialog().lastElementChild).toBe(footer())
    expect(positionOf()).toBe(first)
  })

  it('the backdrop is the one the design asked for', () => {
    open()
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')!
    expect(overlay.className).toContain('bg-black/[0.68]')
    expect(overlay.className).toContain('backdrop-blur-none')
    expect(overlay.className).not.toContain('backdrop-blur-sm')
  })
})

/**
 * LL2, rendered (MAR-3202).
 *
 * The movement is a CSS transition, so what a rendered test can hold is the
 * CONFIGURATION the browser is handed and the END STATE it is asked to walk
 * to. jsdom computes no layout and evaluates no media query, so neither the
 * interpolation itself nor `prefers-reduced-motion` can be observed here --
 * the promise about the preference is kept in a class, so that is where it
 * is checked, exactly as the breathing card's is checked in its stylesheet.
 */

const sheetsOf = () =>
  [...document.querySelectorAll('[data-learn-loom-sheet]')] as HTMLElement[]
/** Everything the guide animates, in one list: the four sheets and the card. */
const animated = () => [...sheetsOf(), ticket()]
const frame = () =>
  document.querySelector('[data-learn-loom-illustration]') as HTMLElement
/**
 * The one sheet the row has actually opened, read from the widths rather
 * than from the active flag: after a burst, "which sheet is open" is a
 * question about geometry, and the flag is not the geometry.
 */
const settled = () =>
  sheetsOf()
    .find((sheet) => sheet.style.flexGrow === '1')
    ?.getAttribute('data-learn-loom-sheet')

/** The whole drawing as one comparable string: where and how wide. */
const geometry = () => ({
  left: ticket().style.left,
  sheets: sheetsOf()
    .map((sheet) => `${sheet.style.flexGrow}/${sheet.style.flexBasis}`)
    .join(' '),
})

describe('MAR-3202 R1: one timing and one curve, worn by everything', () => {
  it('the sheets and the ticket carry the constant itself', () => {
    open()
    for (const el of animated()) {
      const at = el.getAttribute('data-learn-loom-sheet') ?? 'ticket'
      // Mutation: give the ticket its own 200 ms -> its variable reads
      // `200ms` while the sheets read `350ms`, red on this line.
      expect(el.style.getPropertyValue('--learn-loom-duration'), at).toBe(
        `${LEARN_LOOM_MOTION.durationMs}ms`,
      )
      expect(el.style.getPropertyValue('--learn-loom-easing'), at).toBe(
        LEARN_LOOM_MOTION.easing,
      )
      // And the stylesheet reads those variables rather than a second copy
      // of the numbers -- otherwise the constant above would be decoration.
      expect(el.className, at).toContain(
        'duration-[var(--learn-loom-duration)]',
      )
      expect(el.className, at).toContain('ease-[var(--learn-loom-easing)]')
      // Mutation: add `delay-100`, or an inline `transitionDelay` -> red.
      // The handoff forbids a stagger by name; this is where one could enter.
      expect(el.style.transitionDelay, at).toBe('')
      expect(el.className, at).not.toMatch(/\bdelay-/)
    }
  })

  // LL3 changed this assertion's sheet list, and only that: a step changes
  // the sheet's FILL too (closed white/2 %, active white/4 %), which LL2
  // left off the list, so the fill snapped while the border and the width
  // glided. The rule is unchanged -- the list is now the truer reading of
  // "what a step actually changes".
  it('and each transitions only what a step actually changes', () => {
    open()
    for (const sheet of sheetsOf()) {
      expect(sheet.className).toContain(
        'transition-[flex-grow,flex-basis,border-color,background-color]',
      )
    }
    expect(ticket().className).toContain('transition-[left,border-color]')
    // Still only what changes: the ticket's fill is the same at every step,
    // so it is not on its list. Mutation: paste the sheets' property list
    // onto the ticket -> red.
    expect(ticket().className).not.toContain('background-color')
  })
})

describe('MAR-3202 R2: one continuous ticket, out and back', () => {
  it('the same node survives all five moves and all five returns', () => {
    open()
    const first = ticket()
    for (let at = 0; at < 5; at += 1) {
      fireEvent.click(next())
      // Mutation: wrap the ticket in `AnimatePresence` keyed by step, or key
      // it by step -> a fresh node arrives here, red.
      expect(ticket(), `forward to step ${at + 1}`).toBe(first)
      expect(
        document.querySelectorAll('[data-learn-loom-ticket]'),
        `forward to step ${at + 1}`,
      ).toHaveLength(1)
    }
    for (let at = 5; at > 0; at -= 1) {
      press(LEARN_LOOM_CONTROLS.back)
      expect(ticket(), `back to step ${at - 1}`).toBe(first)
      expect(
        document.querySelectorAll('[data-learn-loom-ticket]'),
        `back to step ${at - 1}`,
      ).toHaveLength(1)
    }
  })

  it('and it never fades, because there is nothing to fade into', () => {
    open()
    // An enter/exit animation is the shape of two cards pretending to be
    // one. The ticket may move and may change colour; that is the list.
    expect(ticket().className).not.toContain('opacity')
    expect(ticket().className).not.toContain('transform')
    expect(ticket().className).not.toContain('animate-')
  })
})

describe('MAR-3202 R3: Work, Review and Accept do not slide', () => {
  it('the drawing moves exactly when learnLoomMoves says it does', () => {
    open()
    let before = geometry()
    for (let at = 0; at < 5; at += 1) {
      fireEvent.click(next())
      const after = geometry()
      // The pure rule is the ORACLE and the drawing is measured against it,
      // so an index-derived `learnLoomMoves` fails here as well as in its
      // own table: it would claim work -> review moves while nothing did.
      const moves = learnLoomMoves(at, at + 1)
      expect(after.left !== before.left, `ticket, ${at} -> ${at + 1}`).toBe(
        moves,
      )
      expect(after.sheets !== before.sheets, `sheets, ${at} -> ${at + 1}`).toBe(
        moves,
      )
      before = after
    }
  })

  it('yet the emphasis still changes where the geometry does not', () => {
    open()
    advanceTo(3)
    const still = geometry()
    expect(ticket().className).toContain('border-blue-500')

    fireEvent.click(next())
    // Review -> Accept: the same place in Loom, a different moment in it.
    expect(geometry()).toEqual(still)
    expect(ticket().className).toContain('border-amber-400')
    expect(
      (document.querySelector('[data-learn-loom-active="true"]') as HTMLElement)
        .className,
    ).toContain('border-amber-400')
  })
})

describe('MAR-3202 R4: the frame is the boundary, and it holds', () => {
  it('fixed, clipping, and animating nothing of its own', () => {
    open()
    expect(frame().className).toContain('h-[264px]')
    // The bound, not decoration: the row's widths stay conserved today by
    // arithmetic, and this is what keeps R4 true when LL3 changes the row.
    expect(frame().className).toContain('overflow-hidden')
    // Mutation: give the frame the sheets' motion classes, or a transition
    // on `height` -> red. A boundary that moves is not a boundary.
    expect(frame().className).not.toMatch(/\btransition-/)
    expect(frame().style.getPropertyValue('--learn-loom-duration')).toBe('')
    expect(frame().style.height).toBe('')
  })

  it('and the footer sits outside it at every step', () => {
    open()
    for (let at = 0; at < 6; at += 1) {
      const footer = document.querySelector('[data-learn-loom-footer]')!
      expect(frame().contains(footer), `step ${at}`).toBe(false)
      if (at < 5) fireEvent.click(next())
    }
  })
})

describe('MAR-3202 R5: a burst settles, because nothing is queued', () => {
  it('ten presses land on the arithmetic step’s own geometry', () => {
    const onClose = vi.fn()
    render(<LearnLoomGuide open onClose={onClose} />)
    act(() => {
      for (let at = 0; at < 10; at += 1) next().click()
    })
    // There is no JS animation state, so there is nothing that could lag:
    // the DOM already holds the settled value and the browser is merely
    // retargeted mid-flight. The GEOMETRY is asserted first, before the step
    // text LL1 already owns, so a mutation has to answer LL2's claim rather
    // than trip over a sentence someone else is guarding. Mutation: a
    // non-functional `setStep(step + 1)` -> every press reads the same
    // render, the guide settles on step 1, and the ticket rests at 242px
    // over `next` instead of 18px over `before`, red on the next line.
    expect(ticket().style.left).toBe(`${learnLoomTicketLeft(0)}px`)
    expect(settled()).toBe('before')
    expect(document.querySelectorAll('[data-learn-loom-ticket]')).toHaveLength(
      1,
    )
    expect(screen.getByText('6 / 6')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()

    act(() => {
      for (let at = 0; at < 10; at += 1) {
        screen.getByRole('button', { name: LEARN_LOOM_CONTROLS.back }).click()
      }
    })
    expect(ticket().style.left).toBe(`${learnLoomTicketLeft(3)}px`)
    expect(settled()).toBe('plan')
    expect(document.querySelectorAll('[data-learn-loom-ticket]')).toHaveLength(
      1,
    )
    expect(screen.getByText('1 / 6')).toBeTruthy()
  })
})

describe('MAR-3202 R6: reduced motion is LL1', () => {
  it('every animated element yields its transition to the preference', () => {
    open()
    for (const el of animated()) {
      const at = el.getAttribute('data-learn-loom-sheet') ?? 'ticket'
      // Mutation: drop this class -> red. jsdom evaluates no media query, so
      // the class IS the evidence available here; what it resolves to is
      // Tailwind's own `transition-property: none`, and Marcin's step 14.
      expect(el.className, at).toContain('motion-reduce:transition-none')
    }
  })

  it('and the guide is never hidden or replaced by the preference', () => {
    open()
    // Nothing about the lesson is conditioned on motion: there is no second
    // branch here to fall into. The same four sheets, the same one ticket,
    // the same controls, whatever the preference says.
    expect(sheetsOf()).toHaveLength(4)
    expect(document.querySelectorAll('[data-learn-loom-ticket]')).toHaveLength(
      1,
    )
    expect(within(dialog()).getByText('DEMO-101')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: LEARN_LOOM_CONTROLS.back }),
    ).toBeTruthy()
  })
})

describe('MAR-3202 R7: LL1’s end states, unchanged', () => {
  it('closed sheets still cost 136, and the ticket still lands on LL1’s left', () => {
    open()
    for (let at = 0; at < 6; at += 1) {
      const activeAt = LOOM_SHEETS.indexOf(LEARN_LOOM_STEPS[at]!.activeSheet)
      // The numbers are still derived from `LEARN_LOOM_GEOMETRY`; LL2 only
      // changed when the browser arrives at them.
      expect(ticket().style.left, `step ${at}`).toBe(
        `${learnLoomTicketLeft(activeAt)}px`,
      )
      for (const sheet of sheetsOf()) {
        const name = sheet.getAttribute('data-learn-loom-sheet')
        const isActive = sheet.getAttribute('data-learn-loom-active') === 'true'
        expect(sheet.style.flexGrow, `${name} at step ${at}`).toBe(
          isActive ? '1' : '0',
        )
        expect(sheet.style.flexBasis, `${name} at step ${at}`).toBe(
          isActive ? '0px' : `${LEARN_LOOM_GEOMETRY.closedWidth}px`,
        )
      }
      if (at < 5) fireEvent.click(next())
    }
  })
})

/**
 * LL3, rendered (MAR-3203).
 *
 * The slice is a set of rules about widths, and jsdom computes no widths.
 * What is held here is the only half a rendered test can hold honestly: WHICH
 * element scrolls, and which declarations the browser is handed. That nothing
 * overlaps at 900 x 600 is Marcin's eyes, in the running app -- it is written
 * out in the issue's QA list and claimed by nobody here.
 *
 * Every rule below is a PIN as much as a change: the arithmetic at the ruled
 * floor says the guide already fits, so most of this slice is making sure a
 * later hand cannot quietly take the fit away.
 */

const classesOf = (el: Element) => el.getAttribute('class') ?? ''
/** Everything inside the dialog, itself included, that scrolls vertically. */
const scrollers = () =>
  [dialog(), ...dialog().querySelectorAll('*')].filter((el) =>
    /overflow-y-auto|overflow-y-scroll|overflow-auto|overflow-scroll/.test(
      classesOf(el),
    ),
  )

describe('MAR-3203 R1: one scroller, and it is the teaching body', () => {
  it('exactly one, and the title and the footer are outside it', () => {
    open()
    // Mutation: add `overflow-y-auto` to LEARN_LOOM_DIALOG_CLASS, or to the
    // illustration frame -> two scrollers, red here. Two scrollers is how a
    // short window ends up hiding the close control behind a scrollbar the
    // person never thinks to use.
    expect(scrollers()).toHaveLength(1)
    const body = scrollers()[0]!

    const header = document.querySelector('[data-slot="dialog-header"]')!
    const footer = document.querySelector('[data-learn-loom-footer]')!
    // Mutation: move either inside the body -> red. The title and the way
    // out are the two things a short window may never take away.
    expect(body.contains(header)).toBe(false)
    expect(body.contains(footer)).toBe(false)
    // The header's `shrink-0` is the shared DialogHeader's, not the guide's,
    // so removing it from LEARN_LOOM_HEADER_CLASS leaves this green. The
    // mutation that matches THIS claim is an override -- `shrink` in the
    // guide's own class, which tailwind-merge lets win -> red. The footer is
    // the guide's own div, so there `shrink-0` is ours to lose.
    expect(header.className).toContain('shrink-0')
    expect(footer.className).toContain('shrink-0')

    // And it is the TEACHING body: a scroller that holds nothing scrolls
    // nothing. Mutation: leave the illustration outside it -> red.
    expect(body.contains(frame())).toBe(true)
    expect(
      body.contains(document.querySelector('[data-learn-loom-step]')!),
    ).toBe(true)
  })

  it('and still exactly one when the quick reference is open', () => {
    open()
    press(LEARN_LOOM_CONTROLS.reference)
    expect(scrollers()).toHaveLength(1)
    const body = scrollers()[0]!
    expect(
      body.contains(document.querySelector('[data-learn-loom-reference]')!),
    ).toBe(true)
    expect(
      body.contains(document.querySelector('[data-learn-loom-footer]')!),
    ).toBe(false)
  })
})

describe('MAR-3203 R3: the ticket narrows rather than clipping', () => {
  it('carries a clamp that cannot resolve negative, at every step', () => {
    open()
    for (let at = 0; at < 6; at += 1) {
      // The literal handed to the browser. Mutation: drop the `max(0px, `
      // floor -> the clamp is invalid below 372 px of illustration, the
      // browser discards the whole declaration, and the ticket springs back
      // to its full 360 -- red here.
      expect(ticket().style.maxWidth, `step ${at}`).toBe(
        'max(0px, calc(100% - 372px))',
      )
      // Mutation: replace the derived clamp with a fixed `w-[360px]` and no
      // max-width -> red. The width stays a want, the clamp the bound.
      expect(ticket().style.width, `step ${at}`).toBe(
        `${LEARN_LOOM_GEOMETRY.ticketWidth}px`,
      )
      if (at < 5) fireEvent.click(next())
    }
  })

  it('its prose wraps, and its identifier is one unbreakable token', () => {
    open()
    // Mutation: drop `min-w-0` -> the card's content width becomes its floor
    // and the max-width above is advisory, red here.
    expect(ticket().className).toContain('min-w-0')
    const line = (text: string | RegExp) => within(ticket()).getByText(text)
    for (const text of [
      'Improve account setup',
      'Brief → code check',
      'Illustrative ticket',
    ]) {
      expect(line(text).className, text).toContain('break-words')
    }
    // Mutation: give `DEMO-101` `break-words` too -> red. An identifier
    // broken across two lines is a different identifier to read.
    expect(line('DEMO-101').className).toContain('whitespace-nowrap')
    expect(line('DEMO-101').className).not.toContain('break-words')
  })
})

describe('MAR-3203 R5: the quick reference folds to one column', () => {
  it('one column below 860 px of viewport, two at and above it', () => {
    open()
    press(LEARN_LOOM_CONTROLS.reference)
    const grid = document.querySelector('[data-learn-loom-reference] > div')!
    // A viewport breakpoint, not a container guess: the dialog's own width
    // is a function of the viewport's, so they are the same question, and
    // Electron's View -> Zoom In shrinks the CSS viewport.
    // Mutation: `md:grid-cols-2` (768) instead -> red. 768 is narrower than
    // where these cards actually stop being readable.
    expect(classesOf(grid)).toContain('min-[860px]:grid-cols-2')
    // Mutation: drop `grid-cols-1` and rely on the default -> red. The
    // single column is the stated rule, not an accident of the grid.
    expect(classesOf(grid)).toContain('grid-cols-1')
    expect(classesOf(grid)).not.toMatch(/(^|\s|:)md:grid-cols-2/)
    // Mutation: leave the unconditional `grid-cols-2` in place -> red; it
    // would win below 860 as readily as above it.
    expect(classesOf(grid)).not.toMatch(/(^|\s)grid-cols-2/)
    expect(document.querySelectorAll('[data-learn-loom-card]')).toHaveLength(
      LEARN_LOOM_REFERENCE_CARDS.length,
    )
  })
})

describe('MAR-3203: the footer keeps its primary, whatever it loses', () => {
  it('the quiet controls may narrow and the primary may not', () => {
    open()
    const button = (name: string | RegExp) =>
      screen.getByRole('button', { name })
    // `shrink-0` has to be asked for as a WHOLE class. The shared Button's
    // base already carries `[&_svg]:shrink-0` for its icons, so a plain
    // `toContain('shrink-0')` is green on every button in the app and would
    // prove nothing here -- it is the substring, not the rule.
    const holds = (el: Element) => /(^|\s)shrink-0(\s|$)/.test(classesOf(el))
    const narrows = (el: Element) => /(^|\s)min-w-0(\s|$)/.test(classesOf(el))

    // Mutation: swap the two -> the control that advances the lesson is the
    // first thing squeezed out of a narrow row, red on all four lines.
    expect(holds(next())).toBe(true)
    expect(narrows(next())).toBe(false)
    expect(narrows(button(LEARN_LOOM_CONTROLS.reference))).toBe(true)
    expect(narrows(button(LEARN_LOOM_CONTROLS.back))).toBe(true)
    // The refusing Back is still a quiet control, and narrows like one.
    expect(button(LEARN_LOOM_CONTROLS.back).getAttribute('aria-disabled')).toBe(
      'true',
    )

    // And the same promise in the quick reference's own two-control row.
    // Mutation: give its primary the shared ghost class -> red here, and
    // green on a `toContain` -- which is why this reads the whole class.
    press(LEARN_LOOM_CONTROLS.reference)
    expect(holds(button(LEARN_LOOM_CONTROLS.backToLoom))).toBe(true)
    expect(narrows(button(LEARN_LOOM_CONTROLS.backToLoom))).toBe(false)
    expect(narrows(button(LEARN_LOOM_CONTROLS.restart))).toBe(true)
    expect(holds(button(LEARN_LOOM_CONTROLS.restart))).toBe(false)
  })

  it('and it stays one row: it is never allowed to wrap or stack', () => {
    open()
    const footer = document.querySelector('[data-learn-loom-footer]')!
    // Mutation: add `flex-wrap`, or `flex-col sm:flex-row` -> red. A footer
    // that wraps is a footer that grows, and a footer that grows in a short
    // window pushes the lesson off the top of its own scroller.
    expect(footer.className).toContain('flex-row')
    expect(footer.className).not.toMatch(/\bflex-wrap\b/)
    expect(footer.className).not.toMatch(/\bflex-col\b/)
    expect(footer.className).toContain('h-10')
  })
})

it('MAR-2981 R15 no source says the app cannot automatically start a ready ticket', () => {
  const root = resolve(import.meta.dirname, '../..')
  const old = ['does not automatically', 'start a ready ticket'].join(' ')
  const files = readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  }).filter((f) => f.isFile() && /\.tsx?$/.test(f.name))
  expect(
    files
      .filter((f) =>
        readFileSync(resolve(f.parentPath, f.name), 'utf8').includes(old),
      )
      .map((f) => f.name),
  ).toEqual([])
})
