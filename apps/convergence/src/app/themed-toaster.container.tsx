import { Toaster } from 'sonner'
import { useAppliedTheme } from '@convergence/ui'

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
  return <Toaster position="bottom-right" theme={theme} />
}
