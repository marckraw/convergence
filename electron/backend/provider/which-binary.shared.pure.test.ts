import { describe, expect, it } from 'vitest'
import { getWhichCommandFallback } from './which-binary.shared.pure'

describe('shared getWhichCommandFallback', () => {
  it('returns "which" for non-Darwin, non-Windows hosts', () => {
    expect(getWhichCommandFallback()).toBe('which')
  })
})
