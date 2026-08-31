import type { BrowserWindowConstructorOptions } from 'electron'

interface WindowAppearanceInput {
  platform: NodeJS.Platform
  prefersReducedTransparency: boolean
}

type WindowAppearanceOptions = Pick<
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

const OPAQUE_BACKGROUND = '#16171b'

export function getWindowAppearanceOptions({
  platform,
  prefersReducedTransparency,
}: WindowAppearanceInput): WindowAppearanceOptions {
  if (platform !== 'darwin') {
    return {
      titleBarStyle: 'default',
      backgroundColor: OPAQUE_BACKGROUND,
      hasShadow: true,
      roundedCorners: true,
    }
  }

  const macBase: WindowAppearanceOptions = {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: OPAQUE_BACKGROUND,
    hasShadow: true,
    roundedCorners: true,
  }

  if (prefersReducedTransparency) {
    return macBase
  }

  return {
    ...macBase,
    backgroundColor: '#00000000',
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'followWindow',
  }
}
