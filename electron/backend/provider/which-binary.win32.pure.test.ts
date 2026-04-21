import { describe, expect, it } from 'vitest'
import { getWhichCommand } from './which-binary.win32.pure'

describe('win32 getWhichCommand', () => {
  it('returns "where"', () => {
    expect(getWhichCommand()).toBe('where')
  })
})
