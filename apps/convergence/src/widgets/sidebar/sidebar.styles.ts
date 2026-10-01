import type { Tone } from '@convergence/ui'

/**
 * The collapsed rail's peek handle: a 20 × 56 tab on the rail's right edge,
 * half outside it, that opens the sidebar over the content. It is no control
 * size (R3) on purpose: it reads as the edge of the panel, not a button.
 */
export const peekHandleClass =
  'absolute top-1/2 -right-3 z-20 h-14 w-5 -translate-y-1/2 rounded-l-none rounded-r-md border border-l-0 border-hairline bg-background/90 text-muted-foreground shadow-raised backdrop-blur-sm hover:bg-accent hover:text-foreground'

/** The rail's Needs You mark: a ring in the tone of the loudest card waiting (R1). */
export const railMarkRing: Record<
  Extract<Tone, 'success' | 'warning' | 'danger'>,
  string
> = {
  success: 'border-success-solid',
  warning: 'border-warning-solid',
  danger: 'border-danger-solid',
}
