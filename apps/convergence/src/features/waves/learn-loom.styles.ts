import type { LearnLoomEmphasis } from './learn-loom.pure'

/**
 * The guide's geometry, from the handoff's appearance contract (R10).
 *
 * Sizes are the contract's logical pixels; colours are the app's own theme
 * tokens, never the frozen hexes -- the handoff says so outright: those
 * paints are a reference snapshot of a dark theme, not permission to
 * hardcode colour into a themed app.
 */

/** 1000 wide, never wider than the viewport minus its 24 px margins. */
export const LEARN_LOOM_DIALOG_CLASS =
  'w-[min(1000px,calc(100vw-48px))] max-h-[calc(100vh-48px)] rounded-[20px] gap-0 px-8 pt-7 pb-6'

/** Black at 68 %, and no blur — the contract is explicit about both. */
export const LEARN_LOOM_OVERLAY_CLASS = 'bg-black/[0.68] backdrop-blur-none'

export const LEARN_LOOM_HEADER_CLASS =
  'flex h-11 shrink-0 flex-row items-center justify-between gap-4 space-y-0'

export const LEARN_LOOM_DIALOG_TITLE_CLASS = 'text-[22px] font-semibold'

/**
 * The body is the ONLY flexible region (R10): the footer keeps its place
 * between steps because nothing above it may grow or shrink the box.
 */
export const LEARN_LOOM_BODY_CLASS =
  'mt-5 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-0 py-0'

export const LEARN_LOOM_FOOTER_CLASS =
  'mt-5 flex h-10 shrink-0 flex-row items-center justify-between gap-3 sm:justify-between'

/** 224 wide, the contract's primary button. */
export const LEARN_LOOM_PRIMARY_CLASS = 'h-10 w-[224px] justify-center'
export const LEARN_LOOM_CONTROL_CLASS = 'h-10 px-3'
/**
 * A control that refuses, without leaving the keyboard (lap 3, C): the
 * `disabled` ATTRIBUTE drops focus the moment Back disables itself, so the
 * refusal is said with `aria-disabled` and drawn here.
 */
export const LEARN_LOOM_CONTROL_OFF_CLASS =
  'h-10 px-3 opacity-40 cursor-not-allowed'

/** The step's own colour, not muted (lap 3, G2): it names where you are. */
export const LEARN_LOOM_EYEBROW_CLASS =
  'flex items-center gap-2 text-xs font-semibold tracking-wide'
export const LEARN_LOOM_STEP_TITLE_CLASS =
  'text-[27px] font-semibold leading-[135%] tracking-tight'
export const LEARN_LOOM_MAIN_CLASS = 'text-base leading-[145%]'
/**
 * The headline and its explanation are one filled card (lap 3, G1), not two
 * loose paragraphs: they are the step's single idea, and the frame sets them
 * apart from the prose around them.
 */
export const LEARN_LOOM_KEY_CARD_CLASS =
  'flex flex-col gap-1.5 rounded-xl bg-white/[0.04] px-4 py-3.5'
export const LEARN_LOOM_KEY_HEADLINE_CLASS = 'text-[15px] font-semibold'
export const LEARN_LOOM_KEY_EXPLANATION_CLASS =
  'text-sm leading-[145%] text-muted-foreground'
export const LEARN_LOOM_YOUR_PART_LABEL_CLASS =
  'text-[13px] font-medium uppercase tracking-wide text-muted-foreground'
export const LEARN_LOOM_YOUR_PART_CLASS = 'text-[13px] font-medium'

/** Height 264, and the sheets inside it are all of it. */
export const LEARN_LOOM_ILLUSTRATION_CLASS =
  'flex h-[264px] shrink-0 items-stretch'
export const LEARN_LOOM_SHEET_CLASS =
  'relative flex h-full flex-col rounded-[14px] border p-4'
/** Widths and the overlap come from `LEARN_LOOM_GEOMETRY`, not from here. */
export const LEARN_LOOM_SHEET_CLOSED_CLASS =
  'shrink-0 border-white/10 bg-white/[0.02]'
/** The active sheet's border carries the step's emphasis (lap 3, G3). */
export const LEARN_LOOM_SHEET_ACTIVE_CLASS = 'min-w-0 flex-1 bg-white/[0.04]'
export const LEARN_LOOM_SHEET_NAME_CLASS = 'text-base font-semibold'
export const LEARN_LOOM_SHEET_COUNT_CLASS = 'text-xs text-muted-foreground'

/** 128 tall; its width, left edge and clamp are derived (lap 3, F). */
export const LEARN_LOOM_TICKET_CLASS =
  'absolute top-[116px] flex h-32 flex-col gap-[7px] rounded-[10px] border bg-background/80 p-3'

/** The identifier is small and semibold, in the step's colour (lap 3, G3). */
export const LEARN_LOOM_TICKET_ID_CLASS = 'text-xs font-semibold'
export const LEARN_LOOM_TICKET_TITLE_CLASS = 'text-[15px] text-foreground'
/** Sentence case, muted: a note about the card, not a label on it. */
export const LEARN_LOOM_TICKET_NOTE_CLASS = 'text-[11px] text-muted-foreground'

/**
 * The three emphases, on the app's own tokens (R10).
 *
 * `sky` for work in preparation and in flight, `amber` for the moment it
 * waits on a person, `emerald` for accepted -- the same three families the
 * rest of the app already speaks in (`amber-*` for attention, `sky-*` for a
 * working seat, `emerald-*` for a good outcome). Colour is never the only
 * carrier: the status line's words change at the same time.
 */
export const LEARN_LOOM_EMPHASIS_CLASS: Readonly<
  Record<LearnLoomEmphasis, string>
> = {
  blue: 'border-sky-400/40',
  amber: 'border-amber-400/50',
  green: 'border-emerald-400/50',
}

/** The words that carry the same fact the colour does (R7). */
export const LEARN_LOOM_EMPHASIS_TEXT_CLASS: Readonly<
  Record<LearnLoomEmphasis, string>
> = {
  blue: 'text-sky-300',
  amber: 'text-amber-300',
  green: 'text-emerald-300',
}

export const LEARN_LOOM_TICKET_STATUS_CLASS: Readonly<
  Record<LearnLoomEmphasis, string>
> = {
  blue: 'text-[13px] text-sky-300',
  amber: 'text-[13px] text-amber-300',
  green: 'text-[13px] text-emerald-300',
}

export const LEARN_LOOM_REFERENCE_GRID_CLASS = 'grid grid-cols-2 gap-4'
export const LEARN_LOOM_REFERENCE_CARD_CLASS =
  'flex flex-col gap-1.5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4'
export const LEARN_LOOM_REFERENCE_CARD_TITLE_CLASS = 'text-[15px] font-semibold'
export const LEARN_LOOM_REFERENCE_LINE_CLASS =
  'text-sm leading-[145%] text-muted-foreground'
/** The reference's own promise, above the cards (lap 3, G3). */
export const LEARN_LOOM_REFERENCE_LEAD_CLASS =
  'text-[18px] font-semibold text-foreground'
