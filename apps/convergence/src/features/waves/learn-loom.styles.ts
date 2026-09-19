import type { LearnLoomEmphasis } from './learn-loom.pure'

/**
 * The guide's geometry, read off the frozen frames (R10).
 *
 * Every number below was measured on Figma file `nizmdlM7yENFDQ4XQuFwoN`,
 * nodes `559:805` (1 Prepare), `559:1805` (5 Accept), `559:2055` (6 History)
 * and `559:2305` (Quick reference) -- not inferred. Colours are the app's own
 * theme tokens, never the frozen hexes: those paints are a reference snapshot
 * of one dark theme, not permission to hardcode colour into a themed app.
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

/** 36 tall in the header, where the frame draws it smaller than a control. */
export const LEARN_LOOM_CLOSE_CLASS = 'h-9 px-3'

/** The footer's two quiet controls are a fixed 148 wide; the primary, 224. */
export const LEARN_LOOM_CONTROL_CLASS = 'h-10 w-[148px]'
export const LEARN_LOOM_PRIMARY_CLASS = 'h-10 w-[224px]'
/** The quick reference has two controls, and the frame gives both 240. */
export const LEARN_LOOM_REFERENCE_CONTROL_CLASS = 'h-10 w-[240px]'
/**
 * A control that refuses, without leaving the keyboard (lap 3, C): the
 * `disabled` ATTRIBUTE drops focus the moment Back disables itself, so the
 * refusal is said with `aria-disabled` and drawn here, at the frame's 35 %.
 */
export const LEARN_LOOM_CONTROL_OFF_CLASS =
  'h-10 w-[148px] cursor-not-allowed opacity-35'

/**
 * The eyebrow is blue on EVERY step, not the step's own colour.
 *
 * Measured on `559:810`, `559:1810` and `559:2060`: all three are the same
 * blue, including the amber and green steps. Only two things carry the
 * emphasis in these frames -- the active sheet's border and the ticket's.
 */
export const LEARN_LOOM_EYEBROW_CLASS =
  'flex items-center gap-4 text-xs font-semibold text-blue-500'
export const LEARN_LOOM_STEP_INTRO_CLASS = 'flex flex-col gap-2'
export const LEARN_LOOM_STEP_TITLE_CLASS =
  'text-[27px] font-semibold leading-[135%]'

export const LEARN_LOOM_EXPLANATION_CLASS = 'flex flex-col gap-4'
export const LEARN_LOOM_MAIN_CLASS = 'text-base leading-[145%]'
/**
 * The headline and its explanation are one filled card (lap 3, G1), not two
 * loose paragraphs: they are the step's single idea, and the frame sets them
 * apart from the prose around them. Node `559:847`: no border, radius 10.
 */
export const LEARN_LOOM_KEY_CARD_CLASS =
  'flex flex-col gap-1.5 rounded-[10px] bg-white/[0.04] px-4 py-3.5'
export const LEARN_LOOM_KEY_HEADLINE_CLASS = 'text-[15px] font-semibold'
/** Foreground, not muted: `559:849` is the same grey as the prose above it. */
export const LEARN_LOOM_KEY_EXPLANATION_CLASS = 'text-sm leading-[145%]'
/**
 * One class for the label and the sentence.
 *
 * `559:850` is a SINGLE text node -- `YOUR PART` and the sentence share the
 * size, the weight and the colour, and the gap between them is three spaces.
 */
export const LEARN_LOOM_YOUR_PART_CLASS = 'text-[13px] font-medium'

/** Height 264, and the sheets inside it are all of it. */
export const LEARN_LOOM_ILLUSTRATION_CLASS =
  'flex h-[264px] shrink-0 items-stretch'
/** Padding 12 top, 16 left, 18 right, and no bottom (`559:814`). */
export const LEARN_LOOM_SHEET_CLASS =
  'relative flex h-full flex-col gap-1.5 rounded-[14px] border pt-3 pl-4 pr-[18px]'
/** Widths and the overlap come from `LEARN_LOOM_GEOMETRY`, not from here. */
export const LEARN_LOOM_SHEET_CLOSED_CLASS =
  'shrink-0 border-white/10 bg-white/[0.02]'
/** The active sheet's border carries the step's emphasis (lap 3, G3). */
export const LEARN_LOOM_SHEET_ACTIVE_CLASS = 'min-w-0 flex-1 bg-white/[0.04]'
export const LEARN_LOOM_SHEET_NAME_CLASS = 'text-base font-semibold'
export const LEARN_LOOM_SHEET_COUNT_CLASS = 'text-xs text-muted-foreground'

/** 128 tall; its width, left edge and clamp are derived (lap 3, F). */
export const LEARN_LOOM_TICKET_CLASS =
  'absolute top-[116px] flex h-32 flex-col gap-[7px] rounded-[10px] border bg-white/[0.04] px-3 pt-3'

/**
 * The identifier is blue on every step, like the eyebrow (`559:841`,
 * `559:1841`, `559:2091` are all the same blue), and 11 px, not 12.
 */
export const LEARN_LOOM_TICKET_ID_CLASS =
  'text-[11px] font-semibold text-blue-500'
export const LEARN_LOOM_TICKET_TITLE_CLASS =
  'text-[15px] font-medium text-foreground'
/**
 * The status line is NOT coloured.
 *
 * `559:843`, `559:1843` and `559:2093` are all plain foreground at 12 px --
 * the words change from step to step, the colour does not. That is stronger
 * for R7, not weaker: the fact never rides on the hue alone.
 */
export const LEARN_LOOM_TICKET_STATUS_CLASS = 'text-xs text-foreground'
/** Sentence case, muted, and last in the card: a note, not a label. */
export const LEARN_LOOM_TICKET_NOTE_CLASS = 'text-[10px] text-muted-foreground'

/**
 * The three emphases, on the app's own tokens (R10).
 *
 * Carried by two borders and nothing else -- the active sheet's and the
 * ticket's -- which is what the frames draw. `blue` for work being prepared
 * and done, `amber` for the moment it waits on a person, `emerald` for
 * accepted. Colour is never the only carrier: the status line's words change
 * at the same time.
 */
export const LEARN_LOOM_EMPHASIS_CLASS: Readonly<
  Record<LearnLoomEmphasis, string>
> = {
  blue: 'border-blue-500',
  amber: 'border-amber-400',
  green: 'border-emerald-500',
}

export const LEARN_LOOM_REFERENCE_GRID_CLASS = 'grid grid-cols-2 gap-3'
/** No border in `559:2312`; a fill, radius 12, and 14/15 padding. */
export const LEARN_LOOM_REFERENCE_CARD_CLASS =
  'flex flex-col gap-2 rounded-xl bg-white/[0.04] px-[15px] pt-3.5 pb-4'
export const LEARN_LOOM_REFERENCE_CARD_TITLE_CLASS = 'text-base font-semibold'
/** Foreground, not muted (`559:2314`). */
export const LEARN_LOOM_REFERENCE_LINE_CLASS = 'text-sm leading-[145%]'
/** The reference's own promise, above the cards (`559:2309`): 19 px. */
export const LEARN_LOOM_REFERENCE_LEAD_CLASS =
  'text-[19px] font-semibold leading-[145%] text-foreground'
