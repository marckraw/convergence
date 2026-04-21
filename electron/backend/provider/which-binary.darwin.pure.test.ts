import { describe, expect, it } from 'vitest'
import { getWhichCommand } from './which-binary.darwin.pure'

describe('darwin getWhichCommand', () => {
  it('returns "which"', () => {
    expect(getWhichCommand()).toBe('which')
  })
})
