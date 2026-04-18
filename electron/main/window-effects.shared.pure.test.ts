import { describe, expect, it } from 'vitest'
import {
  OPAQUE_BACKGROUND,
  getDefaultOpaqueWindowOptions,
} from './window-effects.shared.pure'

describe('window-effects.shared.pure', () => {
  it('returns opaque default window options', () => {
    expect(getDefaultOpaqueWindowOptions()).toEqual({
      titleBarStyle: 'default',
      backgroundColor: OPAQUE_BACKGROUND,
      hasShadow: true,
      roundedCorners: true,
    })
  })

  it('exposes the opaque background constant', () => {
    expect(OPAQUE_BACKGROUND).toBe('#16171b')
  })
})
