import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import type { ReactNode } from 'react'
import { TooltipProvider } from './components/tooltip/tooltip'
import { TOOLTIP_DELAY_MS } from './components/tooltip/tooltip-host.pure'

type UiProviderProps = {
  children: ReactNode
}

/**
 * What the parts need once, at the app's root (MAR-3616): the tooltip host
 * every Tooltip and IconButton shows through, and Base UI's tooltip provider
 * for TooltipCard, both on the one delay (200 ms, R0). The confirm host joins
 * in DS3b and the Toaster in DS3d. Mount it once, around the shell; Storybook
 * mounts it around every story.
 */
function UiProvider({ children }: UiProviderProps) {
  return (
    <TooltipPrimitive.Provider delay={TOOLTIP_DELAY_MS}>
      <TooltipProvider>{children}</TooltipProvider>
    </TooltipPrimitive.Provider>
  )
}

export { UiProvider, type UiProviderProps }
