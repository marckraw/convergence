import type { BrowserWindowConstructorOptions } from 'electron'

export const OPAQUE_BACKGROUND = '#16171b'

export type WindowAppearanceOptions = Pick<
  BrowserWindowConstructorOptions,
  | 'backgroundColor'
  | 'hasShadow'
  | 'roundedCorners'
  | 'titleBarStyle'
  | 'trafficLightPosition'
  | 'transparent'
  | 'vibrancy'
  | 'visualEffectState'
>

export function getDefaultOpaqueWindowOptions(): WindowAppearanceOptions {
  return {
    titleBarStyle: 'default',
    backgroundColor: OPAQUE_BACKGROUND,
    hasShadow: true,
    roundedCorners: true,
  }
}
