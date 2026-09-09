import { expect, it } from 'vitest'
import { readClaudeHarnessFact, boundHarnessText } from './claude-harness.pure'

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
      mcpServers: {
        total: 1,
        connected: 0,
        others: [{ name: 'linear', status: 'failed' }],
        omitted: 0,
      },
      plugins: { count: 1, names: ['plug'], omitted: 0 },
      capabilities: { values: ['control'], omitted: 0 },
      tools: null,
      skills: { count: 1 },
      slashCommands: { count: 1 },
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

it.each([4090, 4094])(
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
      preview: 'a'.repeat(n) + (n === 4090 ? '😀' : ''),
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
    preview: output.slice(0, 4090),
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

it.each(['x', '😀', '"', '\u001b'])(
  'R2triple reader budgets %j — mutation count characters or raise caps turns red',
  (point) => {
    const text = point.repeat(10000)
    const wire = {
      type: 'system',
      subtype: 'init',
      claude_code_version: text,
      model: text,
      permissionMode: text,
      mcp_servers: [
        { name: 'online', status: 'connected' },
        ...Array.from({ length: 120 }, () => ({ name: text, status: text })),
      ],
      plugins: Array.from({ length: 120 }, () => ({ name: text, path: text })),
      capabilities: Array(120).fill(text),
      tools: Array(120).fill(text),
      skills: Array(120).fill(text),
      slash_commands: Array(120).fill(text),
    }
    const fact = readClaudeHarnessFact(wire, '2026-09-09T00:00:00.000Z')
    expect(fact).toMatchObject({
      mcpServers: {
        total: 121,
        connected: 1,
        others: expect.any(Array),
        omitted: 104,
      },
      plugins: { count: 120, names: expect.any(Array), omitted: 104 },
      capabilities: { values: expect.any(Array), omitted: 88 },
      tools: { count: 120 },
      skills: { count: 120 },
      slashCommands: { count: 120 },
    })
    if (fact?.kind !== 'harness.init') throw Error('not init')
    const obj = JSON.parse(JSON.stringify(fact))
    expect(obj.mcpServers.others).toHaveLength(16)
    expect(obj.plugins.names).toHaveLength(16)
    expect(obj.capabilities.values).toHaveLength(32)
    const fields = [
      ...obj.mcpServers.others.flatMap(
        (s: { name: string; status: string }) => [
          [s.name, 48],
          [s.status, 64],
        ],
      ),
      ...obj.plugins.names.map((s: string) => [s, 48]),
      ...obj.capabilities.values.map((s: string) => [s, 32]),
      [obj.model, 64],
      [obj.claudeCodeVersion, 64],
      [obj.permissionMode, 64],
    ] as [string, number][]
    for (const [value, limit] of fields) {
      expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThanOrEqual(
        limit,
      )
      expect(value.includes('�')).toBe(false)
    }
    expect(obj.fieldBounds).toMatchObject({
      mcpServers: { truncated: true },
      plugins: { truncated: true },
      capabilities: { truncated: true },
      model: { truncated: true },
    })
    expect(
      Buffer.byteLength(JSON.stringify({ ...fact, turnId: 't'.repeat(36) })),
    ).toBeLessThan(6144)
  },
)
it.each(
  ['x', '😀', '"', '\u001b'].flatMap((point) =>
    ['hook', 'retry', 'compaction', 'denial', 'rateLimit'].map((kind) => ({
      point,
      kind,
    })),
  ),
)(
  'R2triple $kind envelope for $point — mutation remove scalar or field cap turns red',
  ({ point, kind }) => {
    const text = point.repeat(10000),
      scalar = text
    const wires: Record<string, unknown> = {
      hook: {
        type: 'system',
        subtype: 'hook_response',
        hook_id: scalar,
        hook_name: scalar,
        hook_event: scalar,
        outcome: 'success',
        output: text,
      },
      retry: {
        type: 'system',
        subtype: 'api_retry',
        attempt: Number.MAX_VALUE,
        max_retries: Number.MAX_VALUE,
        retry_delay_ms: Number.MAX_VALUE,
        error_status: Number.MAX_VALUE,
        no_response: true,
        error: text,
      },
      compaction: {
        type: 'system',
        subtype: 'compact_boundary',
        compact_metadata: {
          trigger: scalar,
          pre_tokens: Number.MAX_VALUE,
          post_tokens: Number.MAX_VALUE,
          duration_ms: Number.MAX_VALUE,
        },
      },
      denial: {
        type: 'system',
        subtype: 'permission_denied',
        tool_name: scalar,
        tool_use_id: scalar,
        decision_reason_type: scalar,
        decision_reason: text,
      },
      rateLimit: {
        type: 'rate_limit_event',
        rate_limit_info: {
          status: scalar,
          rateLimitType: scalar,
          overageStatus: scalar,
          overageDisabledReason: scalar,
          utilization: Number.MAX_VALUE,
          resetsAt: Number.MAX_VALUE,
          overageResetsAt: Number.MAX_VALUE,
          isUsingOverage: true,
          overageInUse: true,
          surpassedThreshold: Number.MAX_VALUE,
        },
      },
    }
    const fact = readClaudeHarnessFact(wires[kind], '2026-09-09T00:00:00.000Z')!
    expect(
      Buffer.byteLength(JSON.stringify({ ...fact, turnId: 't'.repeat(36) })),
    ).toBeLessThan(6144)
    const obj = JSON.parse(JSON.stringify(fact))
    for (const [key, value] of Object.entries(obj))
      if (typeof value === 'string' && !['kind', 'at', 'phase'].includes(key)) {
        expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThanOrEqual(
          key === 'reason' ? 1024 : key === 'message' ? 512 : 64,
        )
      }
    expect(obj.fieldBounds ?? obj.output).toMatchObject(
      kind === 'hook' ? { hookId: { truncated: true } } : expect.any(Object),
    )
  },
)

it.each(
  [32, 48, 64, 512, 1024, 4096].flatMap((budget) =>
    ['x', '😀', '"', '\u001b'].map((point) => ({ budget, point })),
  ),
)(
  'R2triple text $budget $point — mutation measure characters or split points turns red',
  ({ budget, point }) => {
    const result = boundHarnessText(point.repeat(10000), budget)
    const encodedPointBytes = Buffer.byteLength(JSON.stringify(point)) - 2
    expect(result).toEqual({
      truncated: true,
      bytes: Buffer.byteLength(point.repeat(10000)),
      preview: point.repeat(Math.floor((budget - 2) / encodedPointBytes)),
    })
  },
)

it.each([
  ['"', 3000],
  ['\u001b', 1000],
] as const)(
  'R2triple escaped fast path %s — mutation raw-byte early return turns red',
  (point, count) => {
    const result = boundHarnessText(point.repeat(count), 4096)
    expect(result).toMatchObject({
      truncated: true,
      bytes: count,
      preview: expect.any(String),
    })
    expect(
      typeof result === 'object'
        ? Buffer.byteLength(JSON.stringify(result.preview))
        : Infinity,
    ).toBeLessThanOrEqual(4096)
  },
)
