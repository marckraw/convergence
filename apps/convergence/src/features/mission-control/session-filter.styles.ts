import type { SessionCardState } from './session-card-state.pure'

/**
 * A pressed state chip wears the tone its cards wear in the room (R1), so the
 * filter row and the grid speak one colour per state. Idle keeps the chip's
 * own chosen look (R7), the raised chip.
 */
export const STATE_CHIP_PRESSED: Record<SessionCardState, string> = {
  working: 'data-pressed:border-info-line data-pressed:bg-info-soft',
  'needs-you': 'data-pressed:border-warning-line data-pressed:bg-warning-soft',
  idle: '',
  finished: 'data-pressed:border-success-line data-pressed:bg-success-soft',
  failed: 'data-pressed:border-danger-line data-pressed:bg-danger-soft',
  'host-unreachable':
    'data-pressed:border-warning-line data-pressed:bg-warning-soft',
}

/** A filter chip group: the chips in a wrapping row. */
export const FILTER_CHIP_ROW_CLASS = 'flex flex-wrap items-center gap-1.5'

/** A wrapping row of crew marks on a card. */
export const CREW_ROW_CLASS = 'flex flex-wrap items-center gap-1'

/**
 * The decoration picker's row of swatches: a RadioGroup, which stacks its
 * choices unless told to run them in a row.
 */
export const CREW_SWATCH_ROW_CLASS = 'flex-row flex-wrap items-center gap-1'

/** The filter row's "Clear filters": words that act, quiet beside the chips (MC-15, MC-7). */
export const FILTER_CLEAR_CLASS =
  'px-2 text-2xs font-normal text-ink-muted hover:text-ink'
