import { durationsMs } from '@convergence/ui'
import type { LoomHorseRuntime } from './loom-horses.pure'

export { DRAG_REGION_STYLE, NO_DRAG_STYLE } from '@convergence/ui'

/**
 * Every visual knob of the wave panel (MAR-3097), so "narrower" or "quieter"
 * is one edit, not a hunt through JSX.
 */

/**
 * The column's drag handle (MAR-3155 R4), in the kit's ResizeHandle look
 * (MC-32): a 1 px line in a 13 px hit area that shows a hairline under the
 * pointer, a stronger one while dragged, and the focus colour for the
 * keyboard -- visible in light as in dark, where the white tint it wore was
 * not. Its gesture stays Loom's own (`use-wave-column-resize`).
 */
export const WAVE_RESIZE_HANDLE_CLASS =
  'app-resize-handle app-no-drag relative z-10 -mx-1.5 w-px shrink-0 cursor-col-resize border-x-6 border-x-transparent bg-clip-content outline-none transition-colors hover:bg-hairline active:bg-hairline-strong focus-visible:bg-focus'

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
  'flex h-full shrink-0 overflow-hidden transition-layout duration-panel ease-out motion-reduce:transition-none data-[loom-motion=still]:transition-none'

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
export const LOOM_STRIP_BUTTON_CLASS = 'size-7 shrink-0 p-0'

/**
 * A sheet on the folded column: the glyph, the count under it, no word.
 * `h-auto` and `flex-col` undo the button size's single-line row.
 */
export const LOOM_STRIP_SHEET_CLASS =
  'h-auto w-9 shrink-0 flex-col gap-0.5 rounded-md px-0 py-1.5 text-ink-muted hover:text-ink'

/** The number under a folded sheet's glyph. */
export const LOOM_STRIP_COUNT_CLASS = 'text-3xs font-normal tabular-nums'

/**
 * The guide's entry in expanded Loom's header: the guide's own control width
 * (148 px, the footer's quiet controls'), on the spacing scale.
 */
export const LOOM_GUIDE_ENTRY_CLASS = 'w-37 shrink-0 px-3 py-0 text-xs'

/** The header control that folds Loom away (MAR-3292 R4). */
export const LOOM_COLLAPSE_BUTTON_CLASS = 'size-7 shrink-0 p-0'

/**
 * A sheet's section heading, in the eyebrow look at the 10 px step: Loom's
 * section titles and its horses line are one string (MC-34).
 */
export const WAVE_SECTION_TITLE_CLASS =
  'px-3 pb-1 pt-3 text-3xs font-medium uppercase tracking-eyebrow text-ink-muted'

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

/** Loom's issue card: a quiet fill, a faint edge, its own padding. */
export const LOOM_ROW_CARD_CLASS =
  'gap-2 rounded-lg border-ink/5 bg-fill-quiet p-3'

/** A row outside Loom's cards: no edge, no fill of its own. */
export const WAVE_ROW_PLAIN_CLASS = 'border-transparent bg-transparent'

/**
 * A read-only label chip on a Loom card, an outside row and in the issue
 * detail: a span, never a control (R6), the same chip everywhere (MC-14,
 * MC-35). An outline, not a tint: on the dark paper a tinted chip put its
 * muted words under 4.5:1.
 */
export const LOOM_CHIP_CLASS =
  'rounded border border-hairline px-1.5 py-0.5 text-2xs text-ink-muted'

export const WAVE_ROW_META_CLASS = 'truncate text-2xs text-ink-muted'

/** What the row asks of a person, and a blocked or outage marker: a heads-up. */
export const WAVE_ROW_ACTION_CLASS = 'text-2xs text-warning-ink'

/** The dot on the rail and the header when the tracker is not answering. */
export const WAVE_OUTAGE_DOT_CLASS = 'size-1.5 rounded-full bg-warning-solid'

/**
 * Loom, compact (MAR-3189): the column beside the conversation. No width
 * here, for the reason above -- the width is the decision's number, rendered
 * inline.
 */
export const LOOM_COMPACT_CLASS =
  'flex h-full shrink-0 flex-col border-r border-hairline bg-canvas/40'

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
 * drag-outside / no-drag-inside nesting `session-view.container.tsx:299/303`
 * already uses.
 *
 * Inline styles live in `@convergence/ui` (`NO_DRAG_STYLE`, re-exported
 * above) so the sidebar's tooltips and Loom's share one constant a pin can
 * count (MAR-3314).
 */

/**
 * A sheet's title: a button in both shapes, because it does the same thing in
 * both -- opens its sheet (R1, R7).
 */
export const LOOM_SHEET_TITLE_CLASS =
  'flex w-full items-center gap-2 border-b border-hairline px-3 py-2 text-left text-2xs font-medium tracking-tight text-ink-muted transition-colors hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:outline-none'

/** The open sheet's title, the one the eye should land on first. */
export const LOOM_SHEET_TITLE_OPEN_CLASS = 'text-ink'

/** The open sheet's body: the only scroller in the stack. */
export const LOOM_SHEET_BODY_CLASS =
  'app-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-3'

/**
 * A section's one-line explanation of itself (MAR-3194 R3). Sits under the
 * heading, in the heading's own colour but not its uppercase: it is a
 * sentence to read, not a label to scan past.
 */
export const WAVE_SECTION_HINT_CLASS = 'px-3 pb-1 text-2xs text-ink-muted'

export const LOOM_SHEET_NOTE_CLASS = 'px-3 pt-3 text-2xs text-ink-muted'

/** The horses line above the cards (MAR-3191): a section title (MC-34). */
export const LOOM_HORSES_LINE_CLASS = WAVE_SECTION_TITLE_CLASS

/**
 * A horse card (MAR-3191): the runtime tints it, so a failed seat is visible
 * from across the room and an idle one does not shout.
 *
 * The app's own tokens, not r4's literals: the frame was drawn against a
 * mockup's palette and this panel sits beside the conversation, where a raw
 * hex would be the one surface that does not follow the theme.
 */
export const LOOM_HORSE_CARD_CLASS =
  'flex h-auto w-full flex-col items-start gap-1.5 whitespace-normal rounded-lg border px-3 py-3 text-left text-xs font-normal'

export const LOOM_HORSE_TINT_CLASS: Readonly<Record<LoomHorseRuntime, string>> =
  {
    // R1: a horse at work is info, as a working session is everywhere
    // (MC-2); a failed one is danger.
    working: 'border-info-line bg-info-soft',
    failed: 'border-danger-line bg-danger-soft',
    idle: 'border-hairline',
    'not-seen': 'border-hairline bg-fill-quiet',
  }

/**
 * The ticket line as a door (MAR-3204 R4): raised above the card's stretched
 * button so a click lands here, and marked as a link so it reads as one.
 */
export const LOOM_HORSE_TICKET_DOOR_CLASS =
  'relative z-10 h-auto w-full min-w-0 justify-start whitespace-normal rounded-sm p-0 text-left text-xs font-normal underline-offset-2 hover:bg-transparent hover:text-inherit hover:underline'

/** The card's second line: host · tracker status · lap. */
export const LOOM_HORSE_META_CLASS =
  'whitespace-normal break-words text-2xs text-ink-muted'

/** The runtime word itself, beside the seat's name. */
export const LOOM_HORSE_RUNTIME_CLASS = 'shrink-0 text-2xs font-medium'

/** The reveal control under Awaiting QA. */
export const LOOM_QA_TOGGLE_CLASS =
  'mx-3 mb-1 justify-start px-1 text-2xs text-ink-muted'

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

/** A read-only label chip: a span, never a control (R6); the cards' own chip. */
export const LOOM_DETAIL_CHIP_CLASS = LOOM_CHIP_CLASS

export const LOOM_DETAIL_MUTED_CLASS = 'text-2xs text-ink-muted'

/** The detail's own footer: what this card is, and how fresh. */
export const LOOM_DETAIL_FOOTER_CLASS =
  'pt-1 text-3xs uppercase tracking-eyebrow text-ink-muted'

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

/** The "no match here" line in the open sheet (R3, R5). */
export const LOOM_SEARCH_MISS_CLASS =
  'px-3 pt-3 text-2xs leading-relaxed text-ink-muted'

/** One "1 in Plan" answer: a button that opens that sheet (R3). */
export const LOOM_SEARCH_ELSEWHERE_CLASS =
  'h-auto p-0 text-2xs font-medium text-ink underline underline-offset-2'

/** Expanded Before: keep spare cells and let each card keep its own height. */
export const LOOM_BEFORE_WIDE_CLASS = 'grid grid-cols-fill-90 items-start gap-3'
