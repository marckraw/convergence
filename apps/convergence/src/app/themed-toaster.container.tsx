import { Toaster } from 'sonner'
import { useAppliedTheme } from '@convergence/ui'
import { FLOATING_CORNER_CLEAR_BOTTOM } from '@/shared/ui/floating-corner.pure'

/**
 * Where the stack starts: clear above the feedback button's corner (and the
 * status bar under it), not over them (NAV-7).
 */
const TOAST_OFFSET = { bottom: FLOATING_CORNER_CLEAR_BOTTOM }

/**
 * The app's one toast stack, drawn in the theme on screen.
 *
 * sonner draws its toasts light unless told otherwise, so in the dark app
 * every toast was a white card (audit DS-8). It reads the applied theme here,
 * in a container of its own, so a theme change re-renders the toaster alone
 * and never the app around it.
 */
export function ThemedToasterContainer() {
  const theme = useAppliedTheme()
  return <Toaster position="bottom-right" theme={theme} offset={TOAST_OFFSET} />
}
