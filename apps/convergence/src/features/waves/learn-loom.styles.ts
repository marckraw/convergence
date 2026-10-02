import type { Tone } from '@convergence/ui'
import type { LearnLoomEmphasis } from './learn-loom.pure'

/**
 * The guide's geometry, read off the frozen frames (R10), on the app's tokens
 * (R11, MAR-3617).
 *
 * Every number was measured on Figma file `nizmdlM7yENFDQ4XQuFwoN`, nodes
 * `559:805` (1 Prepare), `559:1805` (5 Accept), `559:2055` (6 History) and
 * `559:2305` (Quick reference). A measured frame is a reference, not a spec of
 * pixels: each size maps to its nearest token -- the type steps (22 and 27 ->
 * 2xl, 19 -> xl, 15 -> sm, 13 -> xs), the line heights (135 % -> snug, 145 % ->
 * normal), the radii (20 and 14 -> 2xl, 10 -> the row corner), the dialog's
 * xl width -- and the lengths take the spacing scale. Only the illustration's
 * own geometry (its height, the ticket's place and its 7 px gap) stays a
 * measured number, written on the scale. Colours are the theme's tokens,
 * never the frozen hexes.
 */

/**
 * The xl dialog (960 px, the nearest step to the frame's 1000), 840 tall on
 * the spacing scale, never taller than the window less its margins (the
 * dialog layer's own padding), on the canvas, in the sheet corner.
 */
export const LEARN_LOOM_DIALOG_CLASS =
  'h-210 max-h-full bg-canvas rounded-2xl gap-0 px-8 pt-7 pb-6'

/** The guide pads itself: the shared header's padding and line give way. */
export const LEARN_LOOM_HEADER_CLASS =
  'flex h-11 shrink-0 flex-row items-center justify-between gap-4 space-y-0 border-b-0 bg-transparent p-0'

export const LEARN_LOOM_DIALOG_TITLE_CLASS = 'text-2xl font-semibold'

/**
 * The body is the ONLY flexible region (R10): the footer keeps its place
 * between steps because nothing above it may grow or shrink the box.
 */
export const LEARN_LOOM_BODY_CLASS =
  'mt-5 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-0 py-0'

export const LEARN_LOOM_FOOTER_CLASS =
  'mt-5 flex h-10 shrink-0 flex-row items-center justify-between gap-3 sm:justify-between'

/** 36 tall in the header (the lg Button), its padding the frame's. */
export const LEARN_LOOM_CLOSE_CLASS = 'px-3'

/**
 * The footer's two quiet controls are a fixed 148 wide; the primary, 224.
 *
 * Which of them gives way when the row runs out of width is decided here and
 * not by the browser's source order (LL3): the quiet controls may narrow
 * (`min-w-0`) and the primary may not (`shrink-0`), so the control that
 * advances the lesson is the last thing on screen rather than the first
 * thing pushed off it. The row still fits with room to spare at the ruled
 * 900 x 600 floor -- this is what happens BELOW the floor, and at zoom.
 */
export const LEARN_LOOM_CONTROL_CLASS = 'w-37 min-w-0'
export const LEARN_LOOM_PRIMARY_CLASS = 'w-56 shrink-0'
/** The quick reference has two controls, and the frame gives both 240. */
export const LEARN_LOOM_REFERENCE_CONTROL_CLASS = 'w-60 min-w-0'
/** Its primary is the same 240, and holds it for the same reason. */
export const LEARN_LOOM_REFERENCE_PRIMARY_CLASS = 'w-60 shrink-0'
/**
 * A control that refuses, without leaving the keyboard (lap 3, C): the
 * `disabled` ATTRIBUTE drops focus the moment Back disables itself, so the
 * refusal is said with `aria-disabled` and drawn here, at the frame's 35 %.
 */
export const LEARN_LOOM_CONTROL_OFF_CLASS =
  'w-37 min-w-0 cursor-not-allowed opacity-35'

/**
 * The eyebrow is the info ink on EVERY step, not the step's own colour.
 *
 * Measured on `559:810`, `559:1810` and `559:2060`: all three are the same
 * blue, including the amber and green steps. Only two things carry the
 * emphasis in these frames -- the active sheet's border and the ticket's. The
 * blue is the info tone's ink, which reads on the canvas in both themes.
 */
export const LEARN_LOOM_EYEBROW_CLASS =
  'flex items-center gap-4 text-xs font-semibold text-info-ink'
export const LEARN_LOOM_STEP_INTRO_CLASS =
  'flex min-h-20.5 shrink-0 flex-col gap-2'
export const LEARN_LOOM_STEP_TITLE_CLASS = 'text-2xl font-semibold leading-snug'

export const LEARN_LOOM_EXPLANATION_CLASS = 'flex shrink-0 flex-col gap-4'
export const LEARN_LOOM_MAIN_CLASS = 'text-base leading-normal'
/**
 * The headline and its explanation are one filled card (lap 3, G1), not two
 * loose paragraphs: they are the step's single idea, and the frame sets them
 * apart from the prose around them. Node `559:847`: no border, radius 10.
 */
export const LEARN_LOOM_KEY_CARD_CLASS =
  'flex flex-col gap-1.5 rounded bg-surface px-4 py-3.5'
export const LEARN_LOOM_KEY_HEADLINE_CLASS = 'text-sm font-semibold'
/** Ink, not muted: `559:849` is the same grey as the prose above it. */
export const LEARN_LOOM_KEY_EXPLANATION_CLASS = 'text-sm leading-normal'
/**
 * One class for the label and the sentence.
 *
 * `559:850` is a SINGLE text node -- `YOUR PART` and the sentence share the
 * size, the weight and the colour, and the gap between them is three spaces.
 */
export const LEARN_LOOM_YOUR_PART_CLASS = 'text-xs font-medium'

/**
 * Height 264, and the sheets inside it are all of it.
 *
 * `overflow-hidden` is the bound behind LL2 R4, not decoration. The row's
 * widths happen to stay conserved mid-transition -- one sheet's `flex-grow`
 * falls by exactly what another's rises, on the same curve -- but that is an
 * arithmetic accident of today's four sheets. Clipping here is what makes
 * "a transition never moves the footer" true whatever LL3 does to the row.
 */
export const LEARN_LOOM_ILLUSTRATION_CLASS =
  'flex h-66 shrink-0 items-stretch overflow-hidden'
/**
 * Padding 12 top, 16 left, 18 right, and no bottom (`559:814`), the frame's
 * radius 14 at the nearest corner (2xl).
 *
 * `shrink-0` and `min-w-0` sit here, shared, rather than on the two states:
 * both are unchanged BY a step, and a property that differs between the
 * states is a property the browser has to interpolate (LL2 R1).
 */
export const LEARN_LOOM_SHEET_CLASS =
  'relative flex h-full min-w-0 shrink-0 flex-col gap-1.5 overflow-hidden rounded-2xl border pt-3 pl-4 pr-4.5'
/**
 * Widths and the overlap come from `LEARN_LOOM_GEOMETRY`, not from here.
 *
 * Neither state names a size any more: `width: 136` on one state and `flex-1`
 * on the other is the same drawing as `flex-basis`/`flex-grow`, and no
 * transition at all -- there is no number in common for the browser to move
 * between. Both states now carry the same two numbers (LL2 R1).
 */
export const LEARN_LOOM_SHEET_CLOSED_CLASS = 'border-line bg-canvas'
/** The active sheet's border carries the step's emphasis (lap 3, G3). */
export const LEARN_LOOM_SHEET_ACTIVE_CLASS = 'bg-surface'

/**
 * The guide's one transition, wherever it is worn (LL2 R1).
 *
 * Duration and curve are read from the custom properties
 * `learnLoomMotionStyle` puts on each animated element, so the timing has
 * exactly one source and the sheets cannot drift away from the ticket.
 *
 * `motion-reduce:transition-none` has to stay a CLASS. Declaring the
 * transition inline instead would out-specify the media query -- inline
 * styles beat it -- and the preference would be read, obeyed by nothing, and
 * silently lost. This is also how the real stack keeps the same promise
 * (`loom-stack.presentational.tsx`).
 */
export const LEARN_LOOM_MOTION_CLASS =
  'duration-(--learn-loom-duration) ease-(--learn-loom-easing) motion-reduce:transition-none'

/**
 * A sheet trades its share of the row, and wears the emphasis: its
 * `flex-grow` and `flex-basis` move, and so do its edge and its fill (the
 * closed sheet is on the canvas, the active one on the surface, and leaving
 * the fill off made it snap while the border and the width glided, LL2's
 * verdict). `transition-layout` moves size, place, edge and fill and nothing
 * else: never `opacity` or `transform`.
 */
export const LEARN_LOOM_SHEET_TRANSITION_CLASS = 'transition-layout'

/**
 * The ticket only ever travels sideways and changes border colour: its
 * `left` and its edge, both in `transition-layout`.
 *
 * Deliberately NOT `opacity` or `transform`: it is one card making one
 * journey, so there is never anything to fade in or out (LL2 R2).
 */
export const LEARN_LOOM_TICKET_TRANSITION_CLASS = 'transition-layout'
export const LEARN_LOOM_SHEET_NAME_CLASS =
  'text-base font-semibold leading-snug'
export const LEARN_LOOM_SHEET_COUNT_CLASS =
  'text-xs leading-snug whitespace-pre-line text-ink-muted'

/**
 * 128 tall; its width, left edge and clamp are derived (lap 3, F).
 *
 * `min-w-0` so the card may actually reach the clamp `learnLoomTicketMaxWidth`
 * hands it: a flex item that refuses to go below its content's width would
 * make the max-width advisory, and the ticket would push out of its sheet at
 * exactly the narrow viewports the clamp exists for (LL3).
 */
export const LEARN_LOOM_TICKET_CLASS =
  'absolute top-29 flex h-32 min-w-0 flex-col leading-snug gap-1.75 rounded border bg-surface px-3 pt-3'

/**
 * The identifier is the info ink on every step, like the eyebrow (`559:841`,
 * `559:1841`, `559:2091` are all the same blue), and 11 px, not 12.
 */
export const LEARN_LOOM_TICKET_ID_CLASS =
  'text-2xs font-semibold whitespace-nowrap text-info-ink'
export const LEARN_LOOM_TICKET_TITLE_CLASS =
  'text-sm font-medium break-words text-ink'
/**
 * The status line is NOT coloured.
 *
 * `559:843`, `559:1843` and `559:2093` are all plain foreground at 12 px --
 * the words change from step to step, the colour does not. That is stronger
 * for R7, not weaker: the fact never rides on the hue alone.
 */
export const LEARN_LOOM_TICKET_STATUS_CLASS = 'text-xs break-words text-ink'
/** Sentence case, muted, and last in the card: a note, not a label. */
export const LEARN_LOOM_TICKET_NOTE_CLASS =
  'text-3xs break-words text-ink-muted'

/**
 * The three emphases, in R1's tones (MC-2): the frames' blue for work being
 * prepared and done is info, their amber for the moment it waits on a person
 * is warning, their green for accepted is success -- the very tones a session
 * wears in those states everywhere else.
 */
export const LEARN_LOOM_EMPHASIS_TONE: Readonly<
  Record<LearnLoomEmphasis, Tone>
> = {
  blue: 'info',
  amber: 'warning',
  green: 'success',
}

/**
 * Carried by two borders and nothing else -- the active sheet's and the
 * ticket's -- which is what the frames draw, in the tone's solid. Colour is
 * never the only carrier: the status line's words change at the same time.
 */
export const LEARN_LOOM_EMPHASIS_CLASS: Readonly<
  Record<LearnLoomEmphasis, string>
> = {
  blue: 'border-info-solid',
  amber: 'border-warning-solid',
  green: 'border-success-solid',
}

/**
 * Two columns only where two columns fit (LL3 R5).
 *
 * A viewport breakpoint rather than a container query: the dialog is
 * `min(1000px, 100vw - 48px)`, so its width is a function of the viewport's
 * and the two are the same question. 860 px is where a card's two columns
 * stop being readable inside the 64 px of dialog padding: the app's own
 * breakpoint, `--breakpoint-learn-loom` in global.css (R11; an arbitrary
 * `min-[860px]` is a magic value). Electron's View -> Zoom In shrinks the CSS
 * viewport, so zoom folds these cards for free.
 */
export const LEARN_LOOM_REFERENCE_GRID_CLASS =
  'grid grid-cols-1 learn-loom:grid-cols-2 gap-3'
/** No border in `559:2312`; a fill, radius 12, and 14/15 padding. */
export const LEARN_LOOM_REFERENCE_CARD_CLASS =
  'flex min-h-38 flex-col gap-2 rounded-xl bg-surface px-4 pt-3.5 pb-4'
export const LEARN_LOOM_REFERENCE_CARD_TITLE_CLASS =
  'text-base font-semibold leading-normal'
/** Ink, not muted (`559:2314`). */
export const LEARN_LOOM_REFERENCE_LINE_CLASS = 'text-sm leading-normal'
/** The reference's own promise, above the cards (`559:2309`): 19 px, the xl step. */
export const LEARN_LOOM_REFERENCE_LEAD_CLASS =
  'text-xl font-semibold leading-normal text-ink'
