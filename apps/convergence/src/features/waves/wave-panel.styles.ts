/**
 * Every visual knob of the wave panel (MAR-3097), so "narrower" or "quieter"
 * is one edit, not a hunt through JSX.
 */

/**
 * The column's drag handle (MAR-3155 R4): a copy of the sidebar's, because a
 * feature may not import from `app` and the two edges may drift apart.
 */
export const WAVE_RESIZE_HANDLE_CLASS =
  'app-resize-handle relative z-10 -mx-1.5 w-px shrink-0 cursor-col-resize border-x-[6px] border-x-transparent bg-clip-content transition-colors hover:bg-white/10 focus-visible:bg-white/20 focus-visible:outline-none'

/** Loom's strip: what a window too narrow for the column leaves. */
export const WAVE_RAIL_CLASS =
  'flex h-full w-11 shrink-0 flex-col items-center gap-3 border-r border-white/10 py-3'

export const WAVE_SECTION_TITLE_CLASS =
  'px-3 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

export const WAVE_ROW_CLASS =
  'flex h-auto w-full flex-col items-start justify-start gap-0.5 whitespace-normal rounded-md px-3 py-1.5 text-left text-xs font-normal'

export const WAVE_ROW_OPENABLE_CLASS =
  'hover:bg-white/5 focus-visible:bg-white/5'

export const WAVE_ROW_META_CLASS = 'truncate text-[11px] text-muted-foreground'

export const WAVE_ROW_ACTION_CLASS = 'text-[11px] text-amber-300/90'

/** The dot on the rail and the header when the tracker is not answering. */
export const WAVE_OUTAGE_DOT_CLASS = 'size-1.5 rounded-full bg-amber-400'

/**
 * Loom, compact (MAR-3189): the column beside the conversation. No width
 * here, for the reason above -- the width is the decision's number, rendered
 * inline.
 */
export const LOOM_COMPACT_CLASS =
  'flex h-full shrink-0 flex-col border-r border-white/10 bg-background/40'

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
  'absolute inset-0 z-20 flex h-full w-full flex-row bg-background'

/**
 * A sheet's title: a button in both shapes, because it does the same thing in
 * both -- opens its sheet (R1, R7).
 */
export const LOOM_SHEET_TITLE_CLASS =
  'flex w-full items-center gap-2 border-b border-white/10 px-3 py-2 text-left text-[11px] font-medium tracking-tight text-muted-foreground transition-colors hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none'

/** The open sheet's title, the one the eye should land on first. */
export const LOOM_SHEET_TITLE_OPEN_CLASS = 'bg-white/[0.04] text-foreground'

/** The open sheet's body: the only scroller in the stack. */
export const LOOM_SHEET_BODY_CLASS =
  'app-scrollbar min-h-0 flex-1 overflow-y-auto pb-3'

export const LOOM_SHEET_NOTE_CLASS =
  'px-3 pt-3 text-[11px] text-muted-foreground'

/**
 * A closed sheet in the expanded stack: a narrow vertical edge, its name and
 * count turned on their side, the way r4 draws them.
 */
export const LOOM_EDGE_CLASS =
  'flex h-full w-11 shrink-0 justify-center rounded-none border-b-0 border-r border-white/10 px-0 py-3 text-center text-[11px] text-muted-foreground'

/** The edge's label, reading bottom-to-top like a book spine. */
export const LOOM_EDGE_LABEL_CLASS =
  'whitespace-nowrap [writing-mode:vertical-rl] rotate-180'

/** The horses line above the cards (MAR-3191). */
export const LOOM_HORSES_LINE_CLASS =
  'px-3 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

/**
 * A horse card (MAR-3191): the runtime tints it, so a failed seat is visible
 * from across the room and an idle one does not shout.
 *
 * The app's own tokens, not r4's literals: the frame was drawn against a
 * mockup's palette and this panel sits beside the conversation, where a raw
 * hex would be the one surface that does not follow the theme.
 */
export const LOOM_HORSE_CARD_CLASS =
  'flex h-auto w-full flex-col items-start gap-0.5 whitespace-normal rounded-md border px-3 py-2 text-left text-xs font-normal'

export const LOOM_HORSE_TINT_CLASS: Readonly<Record<string, string>> = {
  working: 'border-sky-400/30 bg-sky-400/5',
  failed: 'border-red-400/40 bg-red-400/5',
  idle: 'border-white/10',
  'not-seen': 'border-white/10 bg-white/[0.02]',
}

/** The card's second line: host · tracker status · lap. */
export const LOOM_HORSE_META_CLASS =
  'truncate text-[11px] text-muted-foreground'

/** The runtime word itself, beside the seat's name. */
export const LOOM_HORSE_RUNTIME_CLASS = 'shrink-0 text-[11px] font-medium'

/** The reveal control under Awaiting QA. */
export const LOOM_QA_TOGGLE_CLASS =
  'mx-3 mb-1 h-6 justify-start px-1 text-[11px] text-muted-foreground'

/** Expanded lays the horses and the QA list side by side (r4 508:363). */
export const LOOM_NOW_WIDE_CLASS = 'lg:grid lg:grid-cols-2 lg:gap-x-4'
