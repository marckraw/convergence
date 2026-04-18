import {
  OPAQUE_BACKGROUND,
  type WindowAppearanceOptions,
} from './window-effects.shared.pure'

interface DarwinWindowOptionsInput {
  prefersReducedTransparency: boolean
}

export function getDarwinWindowOptions({
  prefersReducedTransparency,
}: DarwinWindowOptionsInput): WindowAppearanceOptions {
  const base: WindowAppearanceOptions = {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: OPAQUE_BACKGROUND,
    hasShadow: true,
    roundedCorners: true,
  }

  if (prefersReducedTransparency) {
    return base
  }

  return {
    ...base,
    backgroundColor: '#00000000',
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'followWindow',
  }
}
