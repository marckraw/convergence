import { describe, expect, it } from 'vitest'
import type { RelayHop } from '@/entities/session-relay'
import {
  ALARMING_RELAY_OUTCOMES,
  buildRelayHopLine,
  buildSessionWireHint,
  countAlarmingHops,
  formatAlarmSummary,
  formatClearTrailConfirm,
  formatKeptHopsNote,
  formatHopCount,
  formatHopTime,
  formatRelayHopOutcome,
  isAlarmingHop,
  relayHopTone,
  UNKNOWN_OUTCOME_LABEL,
} from './relay-hop.pure'
import { MISSING_SESSION_LABEL } from './relay-sentence.pure'

const NAMES: Record<string, string> = {
  s1: 'Implementor',
  s2: 'Reviewer',
  s3: 'Scribe',
}
const resolveName = (id: string): string | null => NAMES[id] ?? null

const NOW = new Date('2026-08-15T12:00:00.000Z')

function hop(overrides: Partial<RelayHop> = {}): RelayHop {
  return {
    id: 'h1',
    relayId: 'r1',
    crewId: 'c1',
    flowRunId: 'run-1',
    firedAt: '2026-08-15T11:59:30.000Z',
    sourceSessionId: 's1',
    targetSessionId: 's2',
    spawnedSessionId: null,
    triggerStatus: 'completed',
    payloadPreview: 'Done. Ready for review.',
    outcome: 'delivered',
    error: null,
    ...overrides,
  }
}

describe('alarming outcomes', () => {
  it('treats errors and burnt budgets as the loud ones', () => {
    expect([...ALARMING_RELAY_OUTCOMES].sort()).toEqual([
      'error',
      'skipped-budget',
    ])
    expect(isAlarmingHop({ outcome: 'error' })).toBe(true)
    expect(isAlarmingHop({ outcome: 'skipped-budget' })).toBe(true)
  })

  it('leaves ordinary work and ordinary skips quiet', () => {
    for (const outcome of [
      'delivered',
      'queued',
      'spawned',
      'skipped-failed',
      'skipped-already-fired',
    ] as const) {
      expect(isAlarmingHop({ outcome })).toBe(false)
    }
  })

  it('counts only the loud ones', () => {
    expect(
      countAlarmingHops([
        { outcome: 'delivered' },
        { outcome: 'error' },
        { outcome: 'skipped-failed' },
        { outcome: 'skipped-budget' },
      ]),
    ).toBe(2)
    expect(countAlarmingHops([])).toBe(0)
  })
})

describe('relayHopTone', () => {
  it('sorts every outcome into one of three tones', () => {
    expect(relayHopTone('delivered')).toBe('delivered')
    expect(relayHopTone('queued')).toBe('delivered')
    expect(relayHopTone('spawned')).toBe('delivered')
    expect(relayHopTone('skipped-failed')).toBe('skipped')
    expect(relayHopTone('skipped-already-fired')).toBe('skipped')
    expect(relayHopTone('skipped-budget')).toBe('alarm')
    expect(relayHopTone('error')).toBe('alarm')
  })

  /**
   * v0.45.22 shipped a `skipped-disarmed` outcome that this build no longer
   * writes. Those rows are sitting in real ledgers, and a silenced wire is the
   * least alarming thing in the app -- it must not turn the crew red.
   */
  it('files a word from another build as quiet and unknown', () => {
    expect(relayHopTone('skipped-disarmed')).toBe('unknown')
    expect(relayHopTone('something-a-later-build-invents')).toBe('unknown')
    expect(relayHopTone('')).toBe('unknown')
    expect(isAlarmingHop({ outcome: 'skipped-disarmed' })).toBe(false)
    expect(countAlarmingHops([{ outcome: 'skipped-disarmed' }])).toBe(0)
  })
})

describe('formatRelayHopOutcome', () => {
  it('says why a skip skipped, never just "skipped"', () => {
    expect(formatRelayHopOutcome('skipped-failed')).toBe(
      'skipped — source failed',
    )
    expect(formatRelayHopOutcome('skipped-budget')).toBe('stopped — hop budget')
    expect(formatRelayHopOutcome('skipped-already-fired')).toBe(
      'already fired this run',
    )
  })

  /**
   * The loop law ending a chain is the wire working. If it ever reads as an
   * alarm the user learns to distrust the thing that stops runaway spending.
   */
  it('keeps the loop law quiet rather than alarming', () => {
    expect(isAlarmingHop({ outcome: 'skipped-already-fired' })).toBe(false)
    expect(countAlarmingHops([{ outcome: 'skipped-already-fired' }])).toBe(0)
    expect(
      (ALARMING_RELAY_OUTCOMES as readonly string[]).includes(
        'skipped-already-fired',
      ),
    ).toBe(false)
  })

  it('keeps the plain outcomes plain', () => {
    expect(formatRelayHopOutcome('delivered')).toBe('delivered')
    expect(formatRelayHopOutcome('queued')).toBe('queued')
    expect(formatRelayHopOutcome('error')).toBe('error')
  })

  it('never renders blank for a word it does not know', () => {
    expect(formatRelayHopOutcome('skipped-disarmed')).toBe(
      UNKNOWN_OUTCOME_LABEL,
    )
    expect(formatRelayHopOutcome('')).toBe(UNKNOWN_OUTCOME_LABEL)
    expect(UNKNOWN_OUTCOME_LABEL.length).toBeGreaterThan(0)
  })
})

describe('buildRelayHopLine — unreadable rows', () => {
  it('carries the raw word for the tooltip, and only when unknown', () => {
    const unknown = buildRelayHopLine(
      hop({ outcome: 'skipped-disarmed' }),
      resolveName,
      NOW,
    )
    expect(unknown.outcomeLabel).toBe(UNKNOWN_OUTCOME_LABEL)
    expect(unknown.rawOutcome).toBe('skipped-disarmed')
    expect(unknown.tone).toBe('unknown')

    // A row this build understands has nothing to disclose.
    expect(buildRelayHopLine(hop(), resolveName, NOW).rawOutcome).toBeNull()
  })
})

describe('formatHopTime', () => {
  it('reads a fresh hop as just now', () => {
    expect(formatHopTime('2026-08-15T11:59:30.000Z', NOW)).toBe('just now')
  })

  it('counts minutes then hours', () => {
    expect(formatHopTime('2026-08-15T11:45:00.000Z', NOW)).toBe('15m ago')
    expect(formatHopTime('2026-08-15T09:00:00.000Z', NOW)).toBe('3h ago')
  })

  it('drops to a date once a hop is more than a day old', () => {
    expect(formatHopTime('2026-08-13T09:00:00.000Z', NOW)).not.toContain('ago')
  })

  it('shows an unreadable timestamp rather than inventing one', () => {
    expect(formatHopTime('not a date', NOW)).toBe('not a date')
  })
})

describe('buildRelayHopLine', () => {
  it('reads a delivery with both names and its preview', () => {
    expect(buildRelayHopLine(hop(), resolveName, NOW)).toEqual({
      sourceName: 'Implementor',
      targetName: 'Reviewer',
      outcomeLabel: 'delivered',
      rawOutcome: null,
      tone: 'delivered',
      timeLabel: 'just now',
      payloadPreview: 'Done. Ready for review.',
      error: null,
    })
  })

  it('prefers the spawned session when a hop made one', () => {
    const line = buildRelayHopLine(
      hop({ targetSessionId: null, spawnedSessionId: 's3' }),
      resolveName,
      NOW,
    )

    expect(line.targetName).toBe('Scribe')
  })

  it('still reads after both its sessions were deleted', () => {
    const line = buildRelayHopLine(
      hop({ sourceSessionId: 'gone', targetSessionId: 'also-gone' }),
      resolveName,
      NOW,
    )

    expect(line.sourceName).toBe(MISSING_SESSION_LABEL)
    expect(line.targetName).toBe(MISSING_SESSION_LABEL)
  })

  it('has no target at all when nothing was ever aimed at', () => {
    const line = buildRelayHopLine(
      hop({ targetSessionId: null, outcome: 'error', error: 'no target' }),
      resolveName,
      NOW,
    )

    expect(line.targetName).toBeNull()
    expect(line.error).toBe('no target')
    expect(line.tone).toBe('alarm')
  })
})

describe('buildSessionWireHint', () => {
  const wire = (
    sourceSessionId: string,
    targetSessionId: string | null,
    armed = true,
  ) => ({ sourceSessionId, targetSessionId, armed })

  it('says nothing for a session no wire touches', () => {
    expect(buildSessionWireHint([wire('s2', 's3')], 's1')).toBeNull()
    expect(buildSessionWireHint([], 's1')).toBeNull()
  })

  it('counts wires in each direction and totals everything touching', () => {
    const hint = buildSessionWireHint(
      [wire('s1', 's2'), wire('s1', 's3'), wire('s3', 's1')],
      's1',
    )

    expect(hint).toMatchObject({ outgoing: 2, incoming: 1, total: 3 })
    expect(hint?.label).toContain('sends its last message on when it finishes')
    expect(hint?.label).toContain('receives from 1 other')
  })

  it('counts only armed wires but still shows a disarmed one exists', () => {
    const hint = buildSessionWireHint([wire('s1', 's2', false)], 's1')

    expect(hint).toMatchObject({ outgoing: 0, incoming: 0, total: 1 })
    expect(hint?.label).toContain('every wire touching it is disarmed')
  })

  it('ignores a wire with no target when counting what arrives', () => {
    const hint = buildSessionWireHint([wire('s1', null)], 's1')

    expect(hint).toMatchObject({ outgoing: 1, incoming: 0, total: 1 })
  })
})

describe('counts and summaries', () => {
  it('counts hops in plain words', () => {
    expect(formatHopCount(0)).toBe('0 hops')
    expect(formatHopCount(1)).toBe('1 hop')
    expect(formatHopCount(7)).toBe('7 hops')
  })

  it('gives the red badge a sentence', () => {
    expect(formatAlarmSummary(1)).toBe('1 relay hop needs your eyes')
    expect(formatAlarmSummary(3)).toBe('3 relay hops need your eyes')
  })
})

describe('clearing the trail says what it is about to do', () => {
  it('names the scope, so "clear" cannot be read as "unwire"', () => {
    expect(formatClearTrailConfirm(0)).toBe(
      'Clear every hop? The wires and sessions stay.',
    )
  })

  it('counts the alerts it is about to dismiss with it', () => {
    expect(formatClearTrailConfirm(1)).toBe(
      'Clear every hop? The wires and sessions stay. This also dismisses 1 alert.',
    )
    expect(formatClearTrailConfirm(4)).toBe(
      'Clear every hop? The wires and sessions stay. This also dismisses 4 alerts.',
    )
  })

  it('says nothing when a clear took everything', () => {
    expect(formatKeptHopsNote(0)).toBeNull()
    expect(formatKeptHopsNote(-1)).toBeNull()
  })

  it('explains the rows a running flow kept', () => {
    expect(formatKeptHopsNote(1)).toBe(
      'Kept 1 hop from a flow that is still running.',
    )
    expect(formatKeptHopsNote(3)).toBe(
      'Kept 3 hops from a flow that is still running.',
    )
  })
})
