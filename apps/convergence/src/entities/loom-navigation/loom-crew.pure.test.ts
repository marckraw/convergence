import { expect, it } from 'vitest'
import { loomCrewForConversation } from './loom-crew.pure'

it('prefers the shown bound crew among multiple seats and otherwise crew order', () => {
  const crews = ['unbound', 'first', 'current'].map((id) => ({
    id,
    bound: id !== 'unbound',
    members: [{ sessionId: 'session' }],
  }))
  const input = {
    session: { id: 'session', projectId: null },
    crews,
    sessions: [],
  }
  expect(loomCrewForConversation({ ...input, current: 'current' })).toBe(
    'current',
  )
  expect(loomCrewForConversation({ ...input, current: 'unbound' })).toBe(
    'first',
  )
  expect(loomCrewForConversation({ ...input, current: null })).toBe('first')
})
