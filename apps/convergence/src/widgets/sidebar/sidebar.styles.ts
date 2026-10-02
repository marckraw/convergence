import type { Tone } from '@convergence/ui'

/**
 * The collapsed rail's peek handle: a 20 × 56 tab on the rail's right edge,
 * half outside it, that opens the sidebar over the content. It is no control
 * size (R3) on purpose: it reads as the edge of the panel, not a button.
 */
export const peekHandleClass =
  'absolute top-1/2 -right-3 z-20 h-14 w-5 -translate-y-1/2 rounded-l-none rounded-r-md border border-l-0 border-hairline bg-canvas/90 text-ink-muted shadow-raised backdrop-blur-sm hover:bg-highlight hover:text-ink'

/** The rail's Needs You mark: a ring in the tone of the loudest card waiting (R1). */
export const railMarkRing: Record<
  Extract<Tone, 'success' | 'warning' | 'danger'>,
  string
> = {
  success: 'border-success-solid',
  warning: 'border-warning-solid',
  danger: 'border-danger-solid',
}

/**
 * A disclosure's chevron (NAV-13): it turns a quarter when its rows are open
 * (add rotate-90), and stands still under reduced motion.
 */
export const disclosureChevronClass =
  'shrink-0 transition-transform motion-reduce:transition-none'

/** A row of the Activity filters: its 10 px label, as tall as the choices beside it. */
export const filterRowLabel =
  'flex h-control-sm w-11 shrink-0 items-center text-3xs text-ink-muted'

/** The choices on a filter row, wrapping when the sidebar is narrow. */
export const filterChoices = 'flex min-w-0 flex-wrap gap-1'

/** The line an empty list says in the sidebar: "No chats yet". */
export const emptyListLine = 'px-1.5 py-1 text-xs text-ink-muted'
