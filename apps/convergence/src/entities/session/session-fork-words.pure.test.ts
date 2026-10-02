import { expect, it } from 'vitest'
import { FORK_ACTION_LABEL } from './session-fork-words.pure'

it('names the fork action once, ending in "…" because it opens a dialog (R10)', () => {
  expect(FORK_ACTION_LABEL).toBe('Fork…')
})
