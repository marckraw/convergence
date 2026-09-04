import type { StudioApi } from './studio-api.types'

/**
 * The window's view of the preload bridge (MAR-2770).
 *
 * The shape itself is not restated here — it is imported — so the renderer and
 * the preload that satisfies it can never disagree about a field.
 */
declare global {
  interface Window {
    backpackStudio: StudioApi
  }
}

export {}
