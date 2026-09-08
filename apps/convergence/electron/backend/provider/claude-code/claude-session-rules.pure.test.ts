import { expect, it } from 'vitest'
import {
  readClaudeSessionRules,
  matchesClaudeSessionRule,
} from './claude-session-rules.pure'

it('R2 only well-formed allow suggestions enter memory — omit shape/behavior checks or drop canonical text turns red', () => {
  expect(
    readClaudeSessionRules([
      null,
      {},
      { type: 'setMode', mode: 'bypassPermissions' },
      {
        type: 'addRules',
        behavior: 'deny',
        rules: [{ toolName: 'Bash', ruleContent: 'denied' }],
      },
      {
        type: 'addRules',
        behavior: 'allow',
        rules: [
          null,
          { toolName: 42, ruleContent: 'bad' },
          { toolName: 'Bash' },
          { toolName: 'Bash', ruleContent: 'exact: * text' },
        ],
      },
      { type: 'addDirectories', directories: ['/fixture', 42] },
    ]),
  ).toEqual({
    rules: [{ toolName: 'Bash', ruleContent: 'exact: * text' }],
    directories: ['/fixture'],
  })
})

it('R2 rules compare both opaque strings and never directories — relax exact tool/content matching turns red', () => {
  const remembered = {
    rules: [{ toolName: 'Bash', ruleContent: 'EXACT *' }],
    directories: ['/fixture'],
  }
  expect([
    matchesClaudeSessionRule(remembered, {
      rules: [{ toolName: 'Bash', ruleContent: 'EXACT *' }],
      directories: [],
    }),
    matchesClaudeSessionRule(remembered, {
      rules: [{ toolName: 'Write', ruleContent: 'EXACT *' }],
      directories: [],
    }),
    matchesClaudeSessionRule(remembered, {
      rules: [{ toolName: 'Bash', ruleContent: 'exact *' }],
      directories: [],
    }),
    matchesClaudeSessionRule(remembered, {
      rules: [],
      directories: ['/fixture'],
    }),
  ]).toEqual([true, false, false, false])
})
