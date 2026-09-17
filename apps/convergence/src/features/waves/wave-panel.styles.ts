/**
 * Every visual knob of the wave panel (MAR-3097), so "narrower" or "quieter"
 * is one edit, not a hunt through JSX.
 */

/** The open column's width, beside the sidebar. */
export const WAVE_PANEL_COLUMN_CLASS =
  'flex h-full w-[280px] shrink-0 flex-col border-r border-white/10 bg-background/40'

/** The collapsed rail. */
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
