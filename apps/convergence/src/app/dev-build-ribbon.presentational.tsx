import type { FC } from 'react'

export const DevBuildRibbon: FC = () => (
  <div
    className="pointer-events-none fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] leading-none font-semibold tracking-wide text-amber-200 uppercase shadow-lg backdrop-blur-md"
    aria-label="Development build"
  >
    Dev version
  </div>
)
