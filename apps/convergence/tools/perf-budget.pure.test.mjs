import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPerfBudget, perfTimingRows } from './perf-budget.pure.mjs'

const report = () => ({
  parameters: { sessions: 2 },
  main: {
    conversationPatched: {
      fullPatchesWhileStreaming: {
        max: 0,
        items: [{ sessionId: 'session', itemId: 'reply', sends: 0 }],
      },
      byOp: { snapshot: 2 },
    },
    attentionRowReads: { total: 5, notNeeded: 0 },
    cpuPercent: 1000000,
    getSummaryById: { ms: 1000000 },
    ipc: { channel: { bytes: 1000000000 } },
  },
  scenario: { rendererErrors: [] },
})

test('accepts the exact counter bounds regardless of CPU, milliseconds and bytes', () => {
  assert.deepEqual(checkPerfBudget(report(), 0), [])
  assert.deepEqual(perfTimingRows(report()), [
    { metric: 'main.cpuPercent', value: 1000000 },
    { metric: 'main.getSummaryById.ms', value: 1000000 },
    { metric: 'main.ipc.channel.bytes', value: 1000000000 },
  ])
})

for (const [name, mutate, message] of [
  [
    'full streaming patch',
    (r) => {
      r.main.conversationPatched.fullPatchesWhileStreaming.max = 5
      r.main.conversationPatched.fullPatchesWhileStreaming.items[0].sends = 5
    },
    'fullPatchesWhileStreaming.max: expected 0..0, received 5; items=[{"sessionId":"session","itemId":"reply","sends":5}]',
  ],
  [
    'snapshot storm',
    (r) => {
      r.main.conversationPatched.byOp.snapshot = 3
    },
    'byOp.snapshot: expected 0..2, received 3',
  ],
  [
    'unnecessary attention read',
    (r) => {
      r.main.attentionRowReads.notNeeded = 1
    },
    'attentionRowReads.notNeeded: expected 0..0, received 1',
  ],
  [
    'renderer error',
    (r) => {
      r.scenario.rendererErrors.push('boom')
    },
    'scenario.rendererErrors: expected 0..0, received 1',
  ],
]) {
  test(`rejects ${name} with its own failure message`, () => {
    const data = report()
    mutate(data)
    assert.deepEqual(checkPerfBudget(data, 0), [message])
  })
}

test('rejects a failed or signaled runner even if counters pass', () => {
  for (const code of [1, null])
    assert.deepEqual(checkPerfBudget(report(), code), [
      `runner.exitCode: expected 0, received ${code}`,
    ])
})

test('reports all violations together and never treats a missing report as zeroes', () => {
  assert.deepEqual(
    checkPerfBudget(undefined, 1).map((failure) => failure.split(':')[0]),
    [
      'parameters.sessions',
      'fullPatchesWhileStreaming.max',
      'byOp.snapshot',
      'attentionRowReads.notNeeded',
      'scenario.rendererErrors',
      'runner.exitCode',
    ],
  )
})

test('rejects missing and malformed counters', () => {
  for (const value of [undefined, null, NaN, Infinity, -1, 0.5, '0']) {
    const data = report()
    data.main.attentionRowReads.notNeeded = value
    assert.equal(checkPerfBudget(data, 0).length, 1)
  }
})
