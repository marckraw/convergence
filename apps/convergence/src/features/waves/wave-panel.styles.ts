import {
  durationsMs,
  focusRingInset,
  resizeHandleStyles,
} from '@convergence/ui'
import type { LoomHorseRuntime } from './loom-horses.pure'
import { sectionLabelVariants } from '@convergence/ui'
import type { Tone } from '@convergence/ui'
import { SESSION_STATE_TONE } from '@/entities/session'

/**
 * Every visual knob of the wave panel (MAR-3097), so "narrower" or "quieter"
 * is one edit, not a hunt through JSX.
 */

/**
 * The column's drag handle (MAR-3155 R4), in the kit's ResizeHandle look
 * (MC-32), taken from the kit itself rather than copied (MC-18): a 1 px line
 * in a 13 px hit area that shows a hairline under the pointer, a stronger one
 * while dragged, and the focus colour for the keyboard. `app-resize-handle`
 * is the sidebar's line's sheen, which both wear. Its gesture stays Loom's
 * own (`use-wave-column-resize`): the width is committed when the drag ends.
 */
export const WAVE_RESIZE_HANDLE_CLASS = `app-resize-handle ${resizeHandleStyles.base} ${resizeHandleStyles.vertical}`

/**
 * The ONE element Loom's two narrow shapes share (MAR-3312 R1).
 *
 * The column and the strip are different components, so nothing used to
 * persist across a fold and the browser had nothing to interpolate: the
 * column became a `w-11` rail in a single frame. This shell is the same DOM
 * node in both modes, it owns the width, and `overflow-hidden` clips
 * whichever shape is momentarily wider than the box travelling around it.
 *
 * The motion is opt-IN through `data-loom-motion`, not always on. The shell's
 * width is also the number the resize handle drags (`use-wave-column-resize`
 * calls `onDraft` on every mousemove) and the number a narrowing window
 * recomputes; a standing 200 ms transition on those would make the column's
 * edge trail the cursor instead of following it. Only a MODE change asks for
 * `slide`; every other width change stays `still`, which is what the drag was
 * before this existed. The attribute selector out-specifies the bare utility,
 * so the two do not depend on Tailwind's emission order.
 *
 * `motion-reduce:transition-none` is a CLASS and the inline style carries
 * `width` alone (R2): an inline `transition` out-specifies the media query,
 * and a person who asked for no motion would be given it anyway
 * (`learn-loom.styles.ts`).
 */
export const LOOM_SHELL_CLASS =
  'app-no-drag flex h-full shrink-0 overflow-hidden transition-layout duration-panel ease-out motion-reduce:transition-none data-[loom-motion=still]:transition-none'

/**
 * How long the fold takes, in the currency each half speaks (MAR-3312 R1/R3).
 *
 * `LOOM_SHELL_CLASS`'s `duration-panel`, the `--animate-loom-enter` delay in
 * `global.css` (`var(--motion-panel)`), and the timer that takes `slide` back
 * off the shell are three spellings of ONE token, --motion-panel;
 * `loom-motion.styles.test.ts` reads the stylesheet and refuses to let them
 * drift apart.
 */
export const LOOM_SLIDE_MS = durationsMs.panel

/** How long the arriving shape takes to fade in, once the width has landed (--motion-fast). */
export const LOOM_ENTER_MS = durationsMs.fast

/**
 * The strip's width as a number (MAR-3312 R1): `WAVE_RAIL_CLASS`'s `w-11` in
 * the currency an inline style speaks, because a class cannot be interpolated
 * from the column's stored pixels. The one place that knows both -- move
 * `w-11` and move this, or the shell travels to a width the strip has not got.
 */
export const LOOM_STRIP_WIDTH_PX = 44

/**
 * The arriving shape, while the shell is still travelling (MAR-3312 R3).
 *
 * The app declares `animate-loom-enter` in `global.css` beside its other
 * keyframes, and its delay is the shell's own duration (--motion-panel) -- the
 * icons arrive when the width has, not on top of a column still shrinking.
 */
export const LOOM_ENTER_CLASS = 'animate-loom-enter motion-reduce:animate-none'

/**
 * Loom's strip: what a window too narrow for the column leaves, and what a
 * chosen fold looks like (MAR-3292 R2). `w-11` either way -- the folded
 * column is the same column, so widening it for the icons would make the two
 * reasons look like two shapes.
 */
export const WAVE_RAIL_CLASS =
  'flex h-full w-11 shrink-0 flex-col items-center gap-2 border-r border-hairline py-3'

/** The strip's two ways out: icon-only, the header controls' size. */
export const LOOM_STRIP_BUTTON_CLASS = 'shrink-0'

/**
 * A sheet on the folded column: the glyph, the count under it, no word, on
 * the Button's 44 px `xl` (ruling 9: a size, never a className height). Only
 * its stack and its quiet ink are set here.
 */
export const LOOM_STRIP_SHEET_CLASS =
  'shrink-0 flex-col gap-0.5 text-ink-muted hover:text-ink'

/** The number under a folded sheet's glyph. */
export const LOOM_STRIP_COUNT_CLASS = 'text-3xs font-normal tabular-nums'

/**
 * The guide's entry in expanded Loom's header: the guide's own control width
 * (148 px, the footer's quiet controls'), on the spacing scale. Its height,
 * padding and words are the Button's `md` (R3, MC-3). The width is the
 * guide's frozen frames' (R11), kept on purpose in
 * scripts/guards/sizes-in-constants.json.
 */
export const LOOM_GUIDE_ENTRY_CLASS = 'w-37 shrink-0'

/** The header control that folds Loom away (MAR-3292 R4). */
export const LOOM_COLLAPSE_BUTTON_CLASS = 'shrink-0'

/**
 * A sheet's section heading, in the eyebrow look at the 10 px step: Loom's
 * section titles and its horses line are one string (MC-34), the kit's
 * SectionLabel print (MC-5).
 */
export const WAVE_SECTION_TITLE_CLASS = `px-3 pb-1 pt-3 ${sectionLabelVariants({ size: 'sm' })}`

export const WAVE_ROW_CLASS =
  'flex w-full flex-col items-start justify-start gap-0.5 rounded-md px-3 py-1.5 text-left text-xs font-normal'

/**
 * A row that opens: the hover fill under the pointer (the Card's own), and
 * the same while its door has the keyboard's focus (the ring is the door's,
 * drawn round the whole card).
 */
export const WAVE_ROW_OPENABLE_CLASS = 'has-focus-visible:bg-fill-hover'

/** A Loom card's first line: the identifier (or glyph) and the words beside it. */
export const LOOM_CARD_HEAD_CLASS = 'flex w-full items-baseline gap-1.5'

/** Loom's issue card: a quiet fill, the hairline edge, its own padding. */
export const LOOM_ROW_CARD_CLASS =
  'gap-2 rounded-lg border-hairline bg-fill-quiet p-3'

/** A row outside Loom's cards: no edge, no fill of its own. */
export const WAVE_ROW_PLAIN_CLASS = 'border-transparent bg-transparent'

export const WAVE_ROW_META_CLASS = 'truncate text-2xs text-ink-muted'

/** What the row asks of a person, and a blocked or outage marker: a heads-up. */
export const WAVE_ROW_ACTION_CLASS = 'text-2xs text-warning-ink'

/**
 * Loom, compact (MAR-3189): the column beside the conversation. No width
 * here, for the reason above -- the width is the decision's number, rendered
 * inline. It stands on the canvas, the surface a side panel and expanded
 * Loom stand on, not the canvas at an alpha over the window's chrome (MC-21).
 */
export const LOOM_COMPACT_CLASS =
  'flex h-full shrink-0 flex-col border-r border-hairline bg-canvas'

/**
 * Loom, expanded: the whole content area, the sheets side by side.
 *
 * A COVER (MAR-3189 lap 2, D): absolutely placed over `app-main-panel` and
 * opaque, so the conversation underneath keeps its box and its measurements
 * while it is out of sight. Nothing here may become `hidden` or
 * `display: none` -- a virtualized transcript with no box measures every row
 * at zero and comes back scrolled somewhere nobody left it.
 */
export const LOOM_EXPANDED_CLASS =
  'absolute inset-0 z-20 flex h-full w-full flex-col bg-canvas'

/**
 * The window-drag regions Loom declares for itself (MAR-3284).
 *
 * Electron builds its draggable region from the DOM in tree order and knows
 * nothing about stacking: a `drag` strip belonging to a view expanded Loom
 * COVERS still takes the mouse through the cover. Loom therefore cannot stay
 * silent about the question -- silence is not "no opinion", it is "whatever
 * is underneath decides", and underneath is `chat-surface`'s or
 * `session-view`'s title strip. So the cover declares `no-drag` over its
 * whole area, its header re-declares `drag`, and each control in that header
 * declares `no-drag` again. Later in the tree wins, which is the same
 * drag-outside / no-drag-inside nesting every title strip uses.
 *
 * Said with the theme's classes, `app-drag` and `app-no-drag` (NAV-11), the
 * one spelling the design system's parts and popups use too: no inline style.
 */

/**
 * A sheet's title: a button in both shapes, because it does the same thing in
 * both -- opens its sheet (R1, R7), on the Button's 44 px `xl` (ruling 9: its
 * height, padding and words are the size's, never a className's). Its ring
 * sits inside its edge, since the column clips what stands outside it (DS-7:
 * it used to cancel the ring).
 */
export const LOOM_SHEET_TITLE_CLASS = `w-full shrink-0 justify-start rounded-xl text-left font-medium tracking-tight text-ink-muted transition-colors hover:bg-fill-hover focus-visible:bg-fill-hover ${focusRingInset}`

/** The open sheet's title, the one the eye should land on first. */
export const LOOM_SHEET_TITLE_OPEN_CLASS = 'text-ink'

/**
 * Expanded Loom's open title sits in from the paper's edge, so its words
 * start where the rows' do (the frames' 24 px across, 20 down).
 */
export const LOOM_SHEET_TITLE_WIDE_CLASS = 'shrink-0 px-3 pt-2'

/**
 * A folded sheet in expanded Loom is a paper you press (MC-6): its glyph,
 * name and counts stacked, and a CardAction whose hit area covers the paper,
 * so no Button is stretched to the paper's height. The hover wash is drawn
 * by that area, under the words (a negative layer inside the paper).
 */
export const LOOM_SHEET_TAB_CLASS =
  'flex flex-col items-center gap-3 px-1 pt-5 text-center text-2xs font-medium tracking-tight text-ink-muted transition-colors after:-z-10 after:rounded-2xl hover:text-ink hover:after:bg-fill-hover'

/** The open sheet's body: the only scroller in the stack. */
export const LOOM_SHEET_BODY_CLASS =
  'min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-3'

/**
 * A section's one-line explanation of itself (MAR-3194 R3). Sits under the
 * heading, in the heading's own colour but not its uppercase: it is a
 * sentence to read, not a label to scan past.
 */
export const WAVE_SECTION_HINT_CLASS = 'px-3 pb-1 text-2xs text-ink-muted'

/**
 * A line under a sheet's list: how many are older, what left the loop. Not
 * an empty sheet's note, which is EmptyState's (MC-20).
 */
export const LOOM_SHEET_NOTE_CLASS = 'px-3 pt-3 text-2xs text-ink-muted'

/** The horses line above the cards (MAR-3191): a section title (MC-34). */
export const LOOM_HORSES_LINE_CLASS = WAVE_SECTION_TITLE_CLASS

/**
 * A horse card (MAR-3191), laid out inside the kit's Card: the runtime tints
 * it, so a failed seat is visible from across the room and an idle one does
 * not shout.
 *
 * The app's own tokens, not r4's literals: the frame was drawn against a
 * mockup's palette and this panel sits beside the conversation, where a raw
 * hex would be the one surface that does not follow the theme.
 */
export const LOOM_HORSE_CARD_CLASS =
  'flex w-full flex-col items-start gap-1.5 whitespace-normal px-3 py-3 text-left text-xs font-normal'

export const LOOM_HORSE_TONE: Readonly<
  Record<LoomHorseRuntime, Tone | undefined>
> = {
  // R1: a horse at work is info, as a working session is everywhere (MC-2);
  // a failed one is danger. The Card's own `tone` draws them, its edge and
  // its tint, never typed again here (N6).
  working: SESSION_STATE_TONE.working,
  failed: SESSION_STATE_TONE.failed,
  idle: undefined,
  'not-seen': undefined,
}

/** An untoned horse card's own frame: the hairline, quiet or faintly filled. */
export const LOOM_HORSE_TINT_CLASS: Readonly<Record<LoomHorseRuntime, string>> =
  {
    working: '',
    failed: '',
    idle: 'border-hairline bg-transparent',
    'not-seen': 'border-hairline bg-fill-quiet',
  }

/**
 * A seat card's door: the seat's name as the Card's CardAction, whose hit
 * area stretches over the whole card, named by the card's own text, with the
 * card's other doors raised above it (MC-12, MC-26: the horse and the
 * mastermind card alike).
 */
export const LOOM_SEAT_CARD_DOOR_CLASS = 'min-w-0 truncate font-medium'

/**
 * The ticket line as a door (MAR-3204 R4): a link Button, words that act,
 * raised above the card's stretched door so a click lands here, in the
 * card's own print and ink, underlined under the pointer as a link is.
 */
export const LOOM_HORSE_TICKET_DOOR_CLASS =
  'relative z-10 w-full min-w-0 justify-start whitespace-normal rounded-sm font-normal text-inherit underline-offset-2'

/** The card's second line: host · tracker status · lap. */
export const LOOM_HORSE_META_CLASS =
  'whitespace-normal break-words text-2xs text-ink-muted'

/** The runtime word itself, beside the seat's name. */
export const LOOM_HORSE_RUNTIME_CLASS = 'shrink-0 text-2xs font-medium'

/**
 * The reveal control under Awaiting QA: the 24 px xs Button's own padding
 * and words (R3), its margin set so its words start where they did.
 */
export const LOOM_QA_TOGGLE_CLASS = 'mx-2 mb-1 justify-start text-ink-muted'

/** Expanded lays the horses and the QA list side by side (r4 508:363): columns of 320 px or more. */
export const LOOM_NOW_WIDE_CLASS = 'grid grid-cols-fit-80 gap-4'

/**
 * The issue detail (MAR-3195): the sheet's body, capped at 520 px (on the
 * spacing scale) so a wide expanded stack does not stretch one paragraph
 * across the room.
 */
export const LOOM_DETAIL_CLASS =
  'flex max-w-130 flex-col gap-2 px-3 pb-3 pt-2 text-xs'

export const LOOM_DETAIL_SECTION_CLASS =
  'flex flex-col gap-1 rounded-md border border-hairline p-2'

export const LOOM_DETAIL_MUTED_CLASS = 'text-2xs text-ink-muted'

/** The detail's own footer: what this card is, and how fresh. */
export const LOOM_DETAIL_FOOTER_CLASS = `pt-1 ${sectionLabelVariants({ size: 'sm' })}`

/**
 * Loom's search field (MAR-3234): the kit's SearchField (MC-17), placed by
 * these classes.
 */
export const LOOM_SEARCH_FIELD_CLASS = 'min-w-0'

/** Expanded: in the header row, 240 px at most (R7). */
export const LOOM_SEARCH_EXPANDED_CLASS = 'w-full max-w-60 shrink'

/** Compact: the field's own row under the header (R7). */
export const LOOM_SEARCH_COMPACT_ROW_CLASS = 'shrink-0 px-3 pb-3'

/** The glyph inside the compact search toggle. */
export const LOOM_SEARCH_GLYPH_CLASS = 'size-3.5'

/** Compact's search icon beside the subline (R7). */
export const LOOM_SEARCH_TOGGLE_CLASS = 'shrink-0 text-ink-muted'

/** Compact's subline row: the subline, then the search icon. */
export const LOOM_SEARCH_SUBLINE_ROW_CLASS = 'mb-2 flex items-start gap-2'

/**
 * One "1 in Plan" answer: a link Button that opens that sheet (R3). A link
 * has no box of its own, so nothing here undoes one.
 */
export const LOOM_SEARCH_ELSEWHERE_CLASS =
  'text-2xs font-medium text-ink underline underline-offset-2'

/** Expanded Before: keep spare cells and let each card keep its own height. */
export const LOOM_BEFORE_WIDE_CLASS = 'grid grid-cols-fill-90 items-start gap-3'

/**
 * The seat card's meta line, by its runtime (DS6): on a card washed in its
 * runtime's tone (working, failed), --ink-muted falls under 4.5:1 in dark over
 * the open sheet's surface-muted paper. --ink-muted-on-tint is the token for
 * muted words on a tint, and holds there; an unwashed card keeps the plain
 * muted ink.
 */
export const LOOM_HORSE_META_INK: Readonly<
  Record<LoomHorseRuntime, string | undefined>
> = {
  working: 'text-ink-muted-on-tint',
  failed: 'text-ink-muted-on-tint',
  idle: undefined,
  'not-seen': undefined,
}
