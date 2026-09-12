import { expect, it } from 'vitest'
import { parseSessionPullRequest } from './session-pull-request.pure'

const fact = {
  number: 42,
  url: 'https://github.com/acme/app/pull/42',
  state: 'open',
  headBranch: 'agent/horse',
  checkedAt: '2026-09-12T12:00:00Z',
  source: 'gh',
}

it('reads the persisted fact (mutation: discard the column)', () => {
  expect(parseSessionPullRequest(JSON.stringify(fact))).toEqual(fact)
})

it.each([
  null,
  undefined,
  '',
  '{',
  JSON.stringify({ ...fact, state: 'invented' }),
  JSON.stringify({ ...fact, number: 0 }),
  JSON.stringify({ ...fact, source: 'transcript' }),
  JSON.stringify({ number: 42 }),
])('unreadable fact %s is unknown (mutation: trust decoded JSON)', (raw) => {
  expect(parseSessionPullRequest(raw)).toBeNull()
})
