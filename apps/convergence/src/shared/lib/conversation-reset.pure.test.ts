import { expect, it } from 'vitest'
import { CONVERSATION_RESET_COMMAND } from './conversation-reset.pure'

it('uses /clear as the shared wire word — rename the command to /new turns red', () => {
  expect(CONVERSATION_RESET_COMMAND).toBe('/clear')
})
