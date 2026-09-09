import { isMcpAlertStatus } from './harness-facts.pure'
import { expect, it } from 'vitest'
import {
  placeCompactions,
  harnessPill,
  compactionLabel,
} from './harness-facts.pure'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
const compact = {
  kind: 'harness.compaction' as const,
  at: 'now',
  sequence: 1,
  trigger: 'auto',
  preTokens: 84000,
  postTokens: 12000,
  durationMs: null,
}
it('R9 pill uses the same current-turn fold as the popover — mutation separate hook count', () => {
  const facts = {
    currentTurn: {
      hooks: [{}, {}],
      denials: [{}],
      retries: { state: 'succeeded', attempts: 3 },
    },
    compactions: [compact],
    init: null,
  } as unknown as SessionHarnessFacts
  expect(harnessPill(facts)).toEqual({
    label: 'Harness · hooks 2 · retry 3 · denied 1 · compacted',
    alert: false,
  })
})
it.each([
  ['in-flight', 'retry 2', true],
  ['failed', 'retry failed', false],
  ['unknown', 'retry ?', false],
] as const)(
  'R4prime %s label and red state — mutation guess resolution',
  (state, text, alert) => {
    const facts = {
      currentTurn: {
        hooks: [],
        denials: null,
        retries: { state, attempts: 2 },
      },
      compactions: [],
      init: null,
    } as unknown as SessionHarnessFacts
    expect(harnessPill(facts)).toEqual({ label: `Harness · ${text}`, alert })
  },
)
it('R3 disconnected MCP is red — mutation ignore MCP status', () => {
  expect(
    harnessPill({
      currentTurn: null,
      compactions: [],
      init: {
        mcpServers: {
          total: 1,
          connected: 0,
          others: [{ name: 'linear', status: 'failed' }],
          omitted: 0,
        },
      },
    } as unknown as SessionHarnessFacts).alert,
  ).toBe(true)
})
it('R5 compaction format carries the recorded boundary — mutation discard post tokens', () => {
  expect(compactionLabel(compact)).toBe('Compacted (auto) · 84k → 12k tokens')
})

it('places boundaries by timestamp and preserves sequence ties — mutation put every compaction at the tail turns red', () => {
  const fact = {
    kind: 'harness.compaction' as const,
    trigger: 'auto',
    preTokens: null,
    postTokens: null,
    durationMs: null,
  }
  const middle = { ...fact, sequence: 2, at: '2026-01-01T00:00:02Z' },
    first = { ...fact, sequence: 1, at: middle.at },
    tail = { ...fact, sequence: 3, at: '2026-01-01T00:00:04Z' }
  const placed = placeCompactions(
    [
      { id: 'a', createdAt: '2026-01-01T00:00:01Z' },
      { id: 'b', createdAt: '2026-01-01T00:00:03Z' },
    ],
    [tail, middle, first],
  )
  expect({
    before: [...placed.before],
    tail: placed.tail,
    empty: placeCompactions([], [tail]).tail,
  }).toEqual({ before: [['b', [first, middle]]], tail: [tail], empty: [tail] })
})

it.each([
  ['connected', false],
  ['pending', false],
  ['disabled', false],
  ['failed', true],
  ['needs-auth', true],
] as const)(
  'I4 MCP %s vocabulary — mutation invert alert statuses turns red',
  (status, alert) => {
    expect({
      status: isMcpAlertStatus(status),
      pill: harnessPill({
        currentTurn: null,
        compactions: [],
        init: {
          mcpServers: {
            total: 1,
            connected: 0,
            others: [{ name: 'server', status }],
            omitted: 0,
          },
        },
      } as unknown as SessionHarnessFacts).alert,
    }).toEqual({ status: alert, pill: alert })
  },
)

it('small compaction placement searches stable time order — mutation search render order turns red', () => {
  const fact = { ...compact, at: '2026-01-01T00:00:02Z' }
  const placed = placeCompactions(
    [
      { id: 'late', createdAt: '2026-01-01T00:00:05Z' },
      { id: 'tie-first', createdAt: '2026-01-01T00:00:03Z' },
      { id: 'tie-second', createdAt: '2026-01-01T00:00:03Z' },
    ],
    [fact],
  )
  expect([...placed.before]).toEqual([['tie-first', [fact]]])
})
