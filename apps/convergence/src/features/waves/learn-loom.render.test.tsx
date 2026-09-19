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
import { LEARN_LOOM_STEPS } from './learn-loom.pure'

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
        'The seat must have a conversation. Today, Fable still hands off work; the app does not automatically start a ready ticket.',
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
    expect(now.textContent).toContain(
      loomSheetTitle('now', LEARN_LOOM_STEPS[4]!.counts),
    )
    expect(now.textContent).toContain('Now')
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
    expect(card.className).toContain('bg-white/[0.04]')
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
