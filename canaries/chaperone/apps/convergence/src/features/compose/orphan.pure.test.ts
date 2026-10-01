// canary: preset/pure-tests-need-source
// A pure test whose orphan.pure.ts is gone.
import { expect, it } from 'vitest'

it('tests nothing', () => {
  expect(1).toBe(1)
})
