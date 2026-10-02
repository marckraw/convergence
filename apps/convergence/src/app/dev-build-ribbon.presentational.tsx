import type { FC } from 'react'
import { SectionLabel, toneInk } from '@convergence/ui'

/**
 * A development build says so at the top of the window, in the warning tone
 * (NAV-30: its amber-200 was unreadable on the light theme), and never takes
 * a click from what is under it. Its words are the kit's eyebrow, in the
 * warning ink, on a warning pill (DS-20).
 */
export const DevBuildRibbon: FC = () => (
  <SectionLabel
    className={`pointer-events-none fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-full border border-warning-line bg-warning-soft px-3 py-1 leading-none shadow-raised backdrop-blur-md ${toneInk.warning}`}
    aria-label="Development build"
  >
    Dev version
  </SectionLabel>
)
