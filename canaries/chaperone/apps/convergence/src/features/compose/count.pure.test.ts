// The sibling test of count.pure.ts, which forgets to call the function it exports (not a canary
// itself).
import { expect, it } from 'vitest'

it('counts nothing', () => {
  expect(true).toBe(true)
})
