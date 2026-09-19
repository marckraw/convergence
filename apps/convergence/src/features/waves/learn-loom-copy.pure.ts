/**
 * Every word the guide says (MAR-3201 R4).
 *
 * One module, by ruling: the lesson's text is a design artefact that was
 * read back from frozen frames and approved as a whole, so it lives where a
 * person can diff it against the handoff in one file instead of hunting it
 * through six components. No `.tsx` of this feature carries a guide string.
 */

/** What the entry control says, in both shells. */
export const LEARN_LOOM_ENTRY = 'How Loom works'

/** The two dialog names; each titles its own view (R7). */
export const LEARN_LOOM_TITLE = 'How Loom works'
export const LEARN_LOOM_REFERENCE_TITLE = 'Loom, at a glance'

/** The one illustrative ticket, whose identity never changes (R3). */
export const LEARN_LOOM_TICKET = {
  identifier: 'DEMO-101',
  title: 'Improve account setup',
  note: 'Illustrative ticket',
} as const

/** The controls, named once. */
export const LEARN_LOOM_CONTROLS = {
  close: 'Close ×',
  reference: 'Quick reference',
  back: 'Back',
  restart: 'Walk through an example →',
  backToLoom: 'Back to Loom',
} as const

/** One step's words. */
export interface LearnLoomStepCopy {
  /** `1 / 6` — the position, said in the eyebrow. */
  index: string
  /** `PREPARE` — the step's own name. */
  label: string
  title: string
  main: string
  keyHeadline: string
  keyExplanation: string
  yourPart: string
  /**
   * The footer's right-hand control. Read from the frozen frames by the
   * mastermind (lap 2, B) — step six's closes the guide instead of advancing.
   */
  primary: string
}

export const LEARN_LOOM_YOUR_PART = 'YOUR PART'

export const LEARN_LOOM_STEP_COPY: readonly LearnLoomStepCopy[] = [
  {
    index: '1 / 6',
    label: 'PREPARE',
    title: 'Turn an idea into work an agent can do.',
    main: 'You and your mastermind shape the brief, then check it against today’s code. In this crew, the mastermind is Fable.',
    keyHeadline: 'Groomed = understood. Grounded = checked in code.',
    keyExplanation:
      'Grounding has a date. After seven days, Loom flags it as expired; ask the mastermind to check it again.',
    yourPart: 'Explain the outcome and how you’ll accept it.',
    primary: 'Next: assign a horse →',
  },
  {
    index: '2 / 6',
    label: 'ASSIGN',
    title: 'Choose the right horse for the work.',
    main: 'Assign a seat with the tools and host this ticket needs. Its queue appears in Next; missing preparation is named there.',
    keyHeadline: 'Ready = groomed + grounded + dispatch.',
    keyExplanation:
      'The seat must have a conversation. Today, Fable still hands off work; the app does not automatically start a ready ticket.',
    yourPart: 'Agree the assignment with your mastermind or in Linear.',
    primary: 'Next: start the work →',
  },
  {
    index: '3 / 6',
    label: 'WORK',
    title: 'Watch the work, not just the spinner.',
    main: 'When the horse picks up the issue, its ticket becomes In Progress. Look in Now for the horse, its host and the issue it holds.',
    keyHeadline: 'Horse activity and ticket status are different.',
    keyExplanation:
      'Working, Idle and Failed describe the agent’s turn. In Progress describes the ticket. An idle horse can still hold unfinished work.',
    yourPart: 'Open the ticket, PR or linked conversation for context.',
    primary: 'Next: review the result →',
  },
  {
    index: '4 / 6',
    label: 'REVIEW',
    title: 'The horse returns. Fable reviews.',
    main: 'The horse reports its work and verification evidence. In Review means the result is waiting for the mastermind’s verdict.',
    keyHeadline:
      'PASS continues. RETURN means another lap. STOP means rethink.',
    keyExplanation:
      'A lap is one execution-and-review round. Corrections return to the horse; stopped work goes back to Plan for re-grooming.',
    yourPart: 'Fable’s turn is still open work, not your QA queue.',
    primary: 'Next: your acceptance →',
  },
  {
    index: '5 / 6',
    label: 'ACCEPT',
    title: 'Reviewed means it’s your turn.',
    main: 'Fable passed the work. It appears in Now → Awaiting QA with Linear status Reviewed. You decide whether it meets the brief.',
    keyHeadline: 'Reviewed is waiting for you. Done means you accepted it.',
    keyExplanation:
      'Check the linked PR or release before testing. Follow the issue’s QA steps; tell your mastermind what passed or what needs fixing.',
    yourPart: 'Accept and say “done”, or send back specific feedback.',
    primary: 'Next: completed work →',
  },
  {
    index: '6 / 6',
    label: 'HISTORY',
    title: 'Accepted work becomes Before.',
    main: 'Once the issue is marked Done in Linear, Loom places it in Before, grouped by wave. Tickets without a wave appear under No wave.',
    keyHeadline: 'A wave groups related tickets. It does not start them.',
    keyExplanation:
      'Before is recent history with a 14-day display window. Done records acceptance; a merged PR and a published release are separate facts.',
    yourPart: 'Reopen this guide from “How Loom works” whenever you need it.',
    primary: 'Back to Loom',
  },
]

/** The quick reference's one-line promise, under its title. */
export const LEARN_LOOM_REFERENCE_LINE =
  'One shared plan. Agents do the work. You accept the result.'

/** One reference card; `lines` are drawn as written, one under the next. */
export interface LearnLoomReferenceCard {
  title: string
  lines: readonly string[]
}

export const LEARN_LOOM_REFERENCE_CARDS: readonly LearnLoomReferenceCard[] = [
  {
    title: 'Where to look',
    lines: [
      'Plan: shape the work. Next: assigned queues.',
      'Now: execution, reviews and decisions.',
      'Before: recent issues marked Done.',
    ],
  },
  {
    title: 'Who does what',
    lines: [
      'Mastermind: prepares and coordinates.',
      'Horse: an executing agent. Seat: its place in the crew. Host: the machine it runs on.',
    ],
  },
  {
    title: 'Read the ticket status',
    lines: [
      'In Review → Fable’s turn.',
      'Reviewed → your QA. Done → accepted.',
      'Horse Idle does not mean ticket Done.',
    ],
  },
  {
    title: 'Read the labels',
    lines: [
      'groomed: brief understood. grounded: code checked. dispatch: cleared for handoff.',
      'horse: assigned seat. wave: work grouping.',
    ],
  },
  {
    title: 'When work needs attention',
    lines: [
      'RETURN: another lap of work and review.',
      'STOP: re-groom in Plan. blocked: Decide in Now. “Not seen” means no observation.',
    ],
  },
  {
    title: 'What you can do today',
    lines: [
      'Open a ticket, its linked PR, Linear or known conversation. Prepare through your mastermind or Linear. Queues are read-only: priority, then issue number.',
    ],
  },
]
