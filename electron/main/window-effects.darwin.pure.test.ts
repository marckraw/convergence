import { describe, expect, it } from 'vitest'
import { getDarwinWindowOptions } from './window-effects.darwin.pure'

describe('window-effects.darwin.pure', () => {
  it('returns vibrancy options when transparency is allowed', () => {
    expect(
      getDarwinWindowOptions({ prefersReducedTransparency: false }),
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

  it('returns opaque hiddenInset options when transparency is reduced', () => {
    expect(
      getDarwinWindowOptions({ prefersReducedTransparency: true }),
    ).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: '#16171b',
      hasShadow: true,
      roundedCorners: true,
    })
  })
})
