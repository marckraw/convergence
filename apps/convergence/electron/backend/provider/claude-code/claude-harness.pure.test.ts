import { expect, it } from 'vitest'
import { readClaudeHarnessFact } from './claude-harness.pure'

it.each([
  [
    {
      type: 'system',
      subtype: 'hook_started',
      hook_id: 'h',
      hook_name: 'guard',
      hook_event: 'PreToolUse',
    },
    {
      kind: 'harness.hook',
      hookId: 'h',
      hookName: 'guard',
      hookEvent: 'PreToolUse',
      phase: 'started',
      status: null,
      output: null,
      at: 'now',
    },
  ],
  [
    {
      type: 'system',
      subtype: 'hook_response',
      hook_id: 'h',
      hook_name: 'guard',
      hook_event: 'PreToolUse',
      exit_code: 2,
      outcome: 'error',
      output: 'blocked',
    },
    {
      kind: 'harness.hook',
      hookId: 'h',
      hookName: 'guard',
      hookEvent: 'PreToolUse',
      phase: 'response',
      status: 'blocked',
      output: 'blocked',
      at: 'now',
    },
  ],
  [
    {
      type: 'system',
      subtype: 'hook_progress',
      hook_id: 'h',
      hook_name: 'guard',
      hook_event: 'PreToolUse',
      output: 'working',
    },
    {
      kind: 'harness.hook',
      hookId: 'h',
      hookName: 'guard',
      hookEvent: 'PreToolUse',
      phase: 'progress',
      status: null,
      output: 'working',
      at: 'now',
    },
  ],
  [
    {
      type: 'system',
      subtype: 'api_retry',
      attempt: 1,
      max_retries: 10,
      retry_delay_ms: 615,
      error_status: null,
      error: 'unknown',
      no_response: true,
    },
    {
      kind: 'harness.retry',
      phase: 'attempt',
      attempt: 1,
      maxRetries: 10,
      retryDelayMs: 615,
      errorStatus: null,
      message: 'unknown',
      noResponse: true,
      at: 'now',
    },
  ],
  [
    {
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: {
        trigger: 'manual',
        pre_tokens: 20686,
        post_tokens: 4630,
        duration_ms: 14465,
      },
    },
    {
      kind: 'harness.compaction',
      trigger: 'manual',
      preTokens: 20686,
      postTokens: 4630,
      durationMs: 14465,
      at: 'now',
    },
  ],
  [
    {
      type: 'system',
      subtype: 'permission_denied',
      tool_name: 'Bash',
      decision_reason_type: 'rule',
      decision_reason: 'No',
    },
    {
      kind: 'harness.denial',
      toolName: 'Bash',
      reasonType: 'rule',
      reason: 'No',
      at: 'now',
    },
  ],
  [
    {
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'rejected',
        rateLimitType: 'five_hour',
        utilization: 1,
        resetsAt: 99,
        overageStatus: 'allowed',
        overageResetsAt: 100,
        overageDisabledReason: 'unknown',
        isUsingOverage: false,
        overageInUse: false,
        surpassedThreshold: 1,
      },
    },
    {
      kind: 'harness.rateLimit',
      status: 'rejected',
      type: 'five_hour',
      utilization: 1,
      resetsAt: 99,
      overageStatus: 'allowed',
      overageResetsAt: 100,
      overageDisabledReason: 'unknown',
      isUsingOverage: false,
      overageInUse: false,
      surpassedThreshold: 1,
      at: 'now',
    },
  ],
  [
    {
      type: 'system',
      subtype: 'init',
      claude_code_version: '2',
      model: 'haiku',
      permissionMode: 'default',
      mcp_servers: [{ name: 'linear', status: 'failed' }],
      plugins: [{ name: 'plug', path: '/plug', version: '1' }],
      capabilities: ['control'],
      skills: ['s'],
      slash_commands: ['compact'],
    },
    {
      kind: 'harness.init',
      claudeCodeVersion: '2',
      model: 'haiku',
      permissionMode: 'default',
      mcpServers: [{ name: 'linear', status: 'failed' }],
      plugins: [{ name: 'plug', path: '/plug', version: '1' }],
      capabilities: ['control'],
      skillsCount: 1,
      slashCommandsCount: 1,
      at: 'now',
    },
  ],
])('reads %j — mutation remove family mapping', (wire, fact) => {
  expect(readClaudeHarnessFact(wire, 'now')).toEqual(fact)
})

it('bounds hook output before persistence — mutation bypass boundedHarnessPayload turns red', () => {
  const output = 'x'.repeat(9000),
    fact = readClaudeHarnessFact(
      { type: 'system', subtype: 'hook_response', output },
      'now',
    )
  expect(fact?.kind === 'harness.hook' ? fact.output : null).toMatchObject({
    truncated: true,
    bytes: 9000,
    preview: expect.stringContaining('xxx'),
  })
})

it.each([4092, 4094])(
  'R2prime raw UTF-8 preview at %i bytes — mutation JSON preview or split code point turns red',
  (n) => {
    const output = 'a'.repeat(n) + '😀' + '\n"tail"'
    const fact = readClaudeHarnessFact(
      { type: 'system', subtype: 'hook_response', output },
      'now',
    )
    expect(fact?.kind === 'harness.hook' ? fact.output : null).toEqual({
      truncated: true,
      bytes: Buffer.byteLength(output),
      preview: 'a'.repeat(n) + (n === 4092 ? '😀' : ''),
    })
  },
)
it('R2prime preview is raw text — mutation JSON stringify preview turns red', () => {
  const output = 'line\n"quoted"\n' + 'x'.repeat(9000),
    fact = readClaudeHarnessFact(
      { type: 'system', subtype: 'hook_response', output },
      'now',
    )
  expect(fact?.kind === 'harness.hook' ? fact.output : null).toEqual({
    truncated: true,
    bytes: Buffer.byteLength(output),
    preview: output.slice(0, 4096),
  })
})

it('small cancelled outcome remains cancelled — mutation map cancellation to unknown turns red', () => {
  expect(
    readClaudeHarnessFact(
      { type: 'system', subtype: 'hook_response', outcome: 'cancelled' },
      'now',
    ),
  ).toMatchObject({ status: 'cancelled' })
})
it('R7 carries the harness tool-use key — mutation drop denial identity turns red', () => {
  expect(
    readClaudeHarnessFact(
      {
        type: 'system',
        subtype: 'permission_denied',
        tool_name: 'Bash',
        tool_use_id: 'B',
      },
      'now',
    ),
  ).toMatchObject({ toolUseId: 'B' })
})
