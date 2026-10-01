import type { CSSProperties } from 'react'

/**
 * Window-chrome drag regions (Electron `WebkitAppRegion`).
 *
 * A portal that floats over the title strip without declaring `no-drag` is
 * chrome the OS can drag — the click never reaches what is underneath
 * (MAR-3284's law). Sidebar tooltips and Loom's share this constant so one
 * pin can count equality across surfaces (MAR-3314 / MAR-3311).
 */
export const LOOM_DRAG_STYLE = {
  WebkitAppRegion: 'drag',
} as CSSProperties

export const LOOM_NO_DRAG_STYLE = {
  WebkitAppRegion: 'no-drag',
} as CSSProperties
