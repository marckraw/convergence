import { expect, it } from 'vitest'
import { foldHarnessFacts } from './harness-facts.pure'
import type {
  HarnessEvent,
  HarnessTurn,
} from '../../../src/shared/types/harness-facts.types'
const turn: HarnessTurn = {
  id: 't',
  status: 'running',
  startedAt: '2026-09-09T00:00:00.000Z',
  endedAt: null,
  permissionDenials: null,
}
const attempt = {
  kind: 'harness.retry' as const,
  phase: 'attempt' as const,
  attempt: 1,
  maxRetries: 10,
  retryDelayMs: 615,
  errorStatus: null,
  message: 'error',
  noResponse: null,
  at: '2026-09-09T00:00:01.000Z',
}
const event = (fact: HarnessEvent['fact'], sequence = 1): HarnessEvent => ({
  sequence,
  turnId: 't',
  fact,
})
it.each([
  ['pending', [event(attempt)], turn, 'in-flight'],
  [
    'success',
    [
      event(attempt),
      event(
        {
          kind: 'harness.retry',
          phase: 'resolved',
          outcome: 'succeeded',
          attempts: 1,
          at: '2026-09-09T00:00:02.000Z',
        },
        2,
      ),
    ],
    turn,
    'succeeded',
  ],
  [
    'failure',
    [
      event(attempt),
      event(
        {
          kind: 'harness.retry',
          phase: 'resolved',
          outcome: 'failed',
          attempts: 1,
          errorSubtype: 'error_during_execution',
          at: '2026-09-09T00:00:02.000Z',
        },
        2,
      ),
    ],
    turn,
    'failed',
  ],
  [
    'process exit',
    [
      event(attempt),
      event({ kind: 'process.ended', at: '2026-09-09T00:00:02.000Z' }, 2),
    ],
    turn,
    'unknown',
  ],
  [
    'ended turn without resolution',
    [event(attempt)],
    { ...turn, status: 'completed' },
    'unknown',
  ],
] as const)(
  'R4prime %s — mutation infer success or ignore process end',
  (_name, events, t, state) => {
    expect(foldHarnessFacts([...events], [t]).currentTurn?.retries?.state).toBe(
      state,
    )
  },
)
it('R3 hooks retain running, duration and truncated output — mutation drop hook projection', () => {
  const started = {
    kind: 'harness.hook' as const,
    hookId: 'h',
    hookName: 'guard',
    hookEvent: 'PreToolUse',
    phase: 'started' as const,
    status: null,
    output: null,
    at: '2026-09-09T00:00:01.000Z',
  }
  const output = { truncated: true as const, bytes: 10000, preview: 'bounded' }
  const facts = foldHarnessFacts(
    [
      event(started),
      event(
        {
          ...started,
          phase: 'response',
          status: 'ok',
          output,
          at: '2026-09-09T00:00:02.000Z',
        },
        2,
      ),
      event({ ...started, hookId: 'pending' }, 3),
    ],
    [turn],
  )
  expect(facts.currentTurn?.hooks).toEqual([
    {
      id: 'h',
      name: 'guard',
      event: 'PreToolUse',
      status: 'ok',
      startedAt: started.at,
      durationMs: 1000,
      output,
    },
    {
      id: 'pending',
      name: 'guard',
      event: 'PreToolUse',
      status: 'running',
      startedAt: started.at,
      durationMs: null,
      output: null,
    },
  ])
})
it('R7 authoritative denial list replaces early copies by turn tool and order — mutation append authoritative denials', () => {
  const denial = {
    kind: 'harness.denial' as const,
    toolName: 'Bash',
    reasonType: 'rule',
    reason: 'No',
    at: attempt.at,
  }
  expect(
    foldHarnessFacts(
      [event(denial), event(denial, 2)],
      [{ ...turn, permissionDenials: [{ tool_name: 'Bash' }] }],
    ).currentTurn?.denials,
  ).toEqual([
    { toolName: 'Bash', reasonType: 'rule', reason: 'No', at: attempt.at },
  ])
})
it('R3 session facts retain compactions and latest init and rate limit — mutation first init wins', () => {
  const init = {
    kind: 'harness.init' as const,
    at: attempt.at,
    claudeCodeVersion: '2',
    model: 'haiku',
    permissionMode: 'default',
    mcpServers: [{ name: 'linear', status: 'failed' }],
    plugins: [],
    capabilities: ['control'],
    skillsCount: 1,
    slashCommandsCount: 2,
  }
  const rate = {
    kind: 'harness.rateLimit' as const,
    at: attempt.at,
    status: 'rejected',
    type: 'five_hour',
    utilization: 1,
    resetsAt: 99,
    overageStatus: null,
    overageResetsAt: null,
    overageDisabledReason: null,
    isUsingOverage: null,
    overageInUse: null,
    surpassedThreshold: null,
  }
  const compact = {
    kind: 'harness.compaction' as const,
    at: attempt.at,
    trigger: 'auto',
    preTokens: 84000,
    postTokens: 12000,
    durationMs: 1200,
  }
  const f = foldHarnessFacts(
    [
      event({ ...init, model: 'old' }),
      event(init, 2),
      event(rate, 3),
      event(compact, 4),
    ],
    [turn],
  )
  expect({
    init: f.init,
    rate: f.rateLimit,
    compactions: f.compactions,
  }).toEqual({ init, rate, compactions: [{ ...compact, sequence: 4 }] })
})
