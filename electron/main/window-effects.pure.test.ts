import { describe, expect, it } from 'vitest'
import { getWindowAppearanceOptions } from './window-effects.pure'

describe('getWindowAppearanceOptions', () => {
  it('keeps non-mac windows opaque', () => {
    expect(
      getWindowAppearanceOptions({
        platform: 'linux',
        prefersReducedTransparency: false,
      }),
    ).toEqual({
      titleBarStyle: 'default',
      backgroundColor: '#16171b',
      hasShadow: true,
      roundedCorners: true,
    })
  })

  it('uses mac vibrancy when transparency is allowed', () => {
    expect(
      getWindowAppearanceOptions({
        platform: 'darwin',
        prefersReducedTransparency: false,
      }),
    ).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: '#00000000',
      hasShadow: true,
      roundedCorners: true,
      transparent: true,
      vibrancy: 'under-window',
      visualEffectState: 'followWindow',
    })
  })

  it('falls back to an opaque mac window when reduced transparency is enabled', () => {
    expect(
      getWindowAppearanceOptions({
        platform: 'darwin',
        prefersReducedTransparency: true,
      }),
    ).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: '#16171b',
      hasShadow: true,
      roundedCorners: true,
    })
  })
})
