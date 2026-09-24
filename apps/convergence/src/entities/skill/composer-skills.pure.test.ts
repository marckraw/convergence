import { expect, it } from 'vitest'
import { filterComposerSkills } from './composer-skills.pure'

it('has no skills before the composer catalog loads', () => {
  expect(
    filterComposerSkills({ catalog: null, providerId: 'codex', query: '' }),
  ).toEqual([])
})
