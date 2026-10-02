// canary: no-inline-drag-region
// A title strip that says its window drag region by hand, as Loom and the conversation header did
// before NAV-11: an inline WebkitAppRegion style, and a data-app-region twin that only a test
// reads. The one spelling is the theme's classes, app-drag and app-no-drag.
import type { CSSProperties } from 'react'

export const titleStripDrag = { WebkitAppRegion: 'drag' } as CSSProperties

export const titleStripControl = { 'data-app-region': 'no-drag' } as const
