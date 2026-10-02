/*
 * The Combobox's look (MAR-3616 DS3e), today's SearchableSelect in DS2's
 * tokens (R0): the raised popup surface (R8), rows that take the highlight
 * fill, and hairlines between the search, the list and the footer.
 */
import { popupSurface } from '../../motion/popup-surface.styles'

/**
 * Where the popup sits: a flex row that caps it at a picker's size (24 rem
 * each way). The popup shrinks along the row to fit it and stretches across
 * it to at most its height, so the popup takes the smaller of its own room
 * and the picker's.
 */
export const comboboxPositioner =
  'z-50 flex max-h-picker max-w-picker outline-none app-no-drag'

/**
 * The popup, on the one popup surface (R8, imported, not retyped: DS-18): as
 * wide as the trigger (at least 13 rem, at most 24 rem or the room the window
 * leaves), as tall as the room below or above it allows, up to 24 rem.
 */
export const comboboxPopup = [
  popupSurface,
  'flex min-h-0 flex-col overflow-hidden outline-none',
  'w-(--anchor-width) min-w-52 max-w-(--available-width)',
  'max-h-(--available-height)',
].join(' ')

/** A choice's name and its badge side by side: in a row of the list, and on the trigger. */
export const comboboxNameRow = 'flex min-w-0 items-center gap-2'

/** The search field's strip at the top. */
export const comboboxSearch = 'shrink-0 border-b border-line p-1.5'

/** The list: it scrolls inside the popup, under the search. */
export const comboboxList = 'min-h-0 flex-1 overflow-y-auto p-1 outline-none'

/**
 * A row: the highlight (keyboard or pointer) takes today's hover fill. A
 * disabled row is dimmed and starts at the top, as its reason may wrap.
 */
export const comboboxItem = [
  'group flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none select-none',
  'data-highlighted:bg-highlight data-highlighted:text-on-highlight',
  'data-disabled:items-start data-disabled:opacity-50',
].join(' ')

/** A group's heading: a small muted label above its rows. */
export const comboboxGroupLabel =
  'px-2 pt-2 pb-1 text-2xs font-medium text-ink-muted'

/** The strip under the list: the action, or the caller's footer. */
export const comboboxFooter = 'shrink-0 border-t border-line p-1'
