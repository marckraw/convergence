import { expect, it } from 'vitest'
import { describeClaudeTransportVersionRefusal } from './claude-transport-error.pure'

it('names an explicit minimum-version refusal only — drop refusal classification turns red', () => {
  // These are refusal/error fixtures, not a claim that SDK 0.3.263 emits them.
  expect([
    describeClaudeTransportVersionRefusal(
      'Claude Code version is too old; minimum supported version is 2.1.20',
      '2.1.10',
    ),
    describeClaudeTransportVersionRefusal(
      'Claude Code process exited with code 1',
      '2.1.10',
    ),
    describeClaudeTransportVersionRefusal(
      'Minimum version of Node.js not met',
      '2.1.10',
    ),
    describeClaudeTransportVersionRefusal(undefined, null),
  ]).toEqual([
    'Claude Code 2.1.10 is older than this app supports',
    null,
    null,
    null,
  ])
})
