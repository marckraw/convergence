import { Toaster } from '@convergence/ui'
import { FLOATING_CORNER_CLEAR_BOTTOM } from '@/entities/feedback'

/**
 * Where the stack starts: clear above the feedback button's corner (and the
 * status bar under it), not over them (NAV-7).
 */
const TOAST_OFFSET = { bottom: FLOATING_CORNER_CLEAR_BOTTOM }

/**
 * The app's one toast stack: the design system's Toaster, which draws each
 * toast on the popup surface in the theme's tokens (DS-8, NAV-7), placed
 * clear of the feedback button's corner, which only the app knows about.
 */
export function ThemedToasterContainer() {
  return <Toaster offset={TOAST_OFFSET} />
}
