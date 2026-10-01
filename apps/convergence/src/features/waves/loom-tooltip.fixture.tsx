import type { FC, ReactNode } from 'react'
import {
  render as renderWithoutProvider,
  type RenderOptions,
} from '@testing-library/react'
import { TooltipProvider } from '@convergence/ui'

/**
 * The provider Loom's controls now need, for suites that mount Loom alone
 * (MAR-3311 R1).
 *
 * Loom's icon controls wear the app's shared tooltip instead of the OS hint,
 * and the tooltip host lives in the provider: with none above it a control
 * keeps its name but shows no tooltip. The running app mounts exactly one,
 * at the root, above `AppShell` (`App.container`'s `UiProvider`), which is
 * the whole point of the rule: one tooltip for the whole app, one delay.
 * These suites mount `WavePanel` and `LoomStripView` on their own, outside
 * that root, so they stand in for it here rather than Loom growing a second
 * provider of its own and a second copy of the app's delay.
 *
 * `wrapper` rather than wrapping each element, so `rerender` keeps the
 * provider too -- a rerender with a bare element would throw again.
 *
 * The delay is the host's own: nothing here waits on a number. The hover pins open the tooltip and then `findBy*` for it, so they read
 * the tooltip that appears rather than a number this fixture chose.
 */
const LoomTooltipHost: FC<{ children: ReactNode }> = ({ children }) => (
  <TooltipProvider>{children}</TooltipProvider>
)

export const render = (
  ui: Parameters<typeof renderWithoutProvider>[0],
  options?: Omit<RenderOptions, 'wrapper'>,
) => renderWithoutProvider(ui, { wrapper: LoomTooltipHost, ...options })
