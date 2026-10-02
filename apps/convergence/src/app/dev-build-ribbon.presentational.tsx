import type { FC } from 'react'

/**
 * A development build says so at the top of the window, in the warning tone
 * (NAV-30: its amber-200 was unreadable on the light theme), and never takes
 * a click from what is under it.
 */
export const DevBuildRibbon: FC = () => (
  <div
    className="pointer-events-none fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-full border border-warning-line bg-warning-soft px-3 py-1 text-2xs leading-none font-semibold tracking-wide text-warning-ink uppercase shadow-raised backdrop-blur-md"
    aria-label="Development build"
  >
    Dev version
  </div>
)
