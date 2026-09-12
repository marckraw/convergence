import { expect, it } from 'vitest'
import {
  parseSessionPullRequest,
  readSessionPullRequest,
} from './session-pull-request.pure'

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
  JSON.stringify({ ...fact, url: '' }),
  JSON.stringify({ number: 42 }),
])('unreadable fact %s is unknown (mutation: trust decoded JSON)', (raw) => {
  expect(parseSessionPullRequest(raw)).toBeNull()
})

/**
 * The parser names the part it stopped at, so a caller that has to explain the
 * refusal to a person reads the answer instead of re-deriving it (MAR-2991).
 *
 * Mutation: return a constant part and every row but the first goes red.
 */
it.each([
  [null, 'json'],
  ['{', 'json'],
  ['42', 'json'],
  [JSON.stringify({ ...fact, number: 0 }), 'number'],
  [JSON.stringify({ ...fact, url: '' }), 'url'],
  [JSON.stringify({ ...fact, state: 'invented' }), 'state'],
  [JSON.stringify({ ...fact, headBranch: null }), 'headBranch'],
  [JSON.stringify({ ...fact, checkedAt: null }), 'checkedAt'],
  [JSON.stringify({ ...fact, source: 'transcript' }), 'source'],
])('names the part that stopped the reading of %s', (raw, part) => {
  expect(readSessionPullRequest(raw)).toEqual({ fact: null, unreadable: part })
})

it('names nothing when the reading is whole', () => {
  expect(readSessionPullRequest(JSON.stringify(fact))).toEqual({
    fact,
    unreadable: null,
  })
})
