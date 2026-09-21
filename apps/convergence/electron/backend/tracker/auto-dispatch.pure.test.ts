import { describe, expect, it } from 'vitest'
import { planAutoDispatch, type DispatchSeat } from './auto-dispatch.pure'
import type { WorkLedgerRecord } from '../../../src/shared/types/tracker.types'

const ready = {
  logicalStatus: null,
  branchName: null,
  updatedAt: null,
  groomed: true,
  grounded: true,
  dispatch: true,
}
const row = (
  id: string,
  patch: Partial<WorkLedgerRecord> = {},
): WorkLedgerRecord => ({
  id,
  crewId: 'crew',
  issueId: id,
  issueIdentifier: `MAR-${id}`,
  issueTitle: id,
  issueUrl: '',
  seat: 'horse',
  wave: null,
  lap: 0,
  state: 'assigned',
  trackerStatus: '',
  groundedAt: null,
  seenAt: '2026-09-21T00:00:00Z',
  fact: ready,
  verdict: null,
  verdictSettleId: null,
  verdictNote: null,
  blocked: false,
  ...patch,
})
const horse = (patch: Partial<DispatchSeat> = {}): DispatchSeat => ({
  batonName: 'horse',
  sessionId: 's',
  role: 'horse',
  wipLimit: 1,
  availability: 'idle',
  lane: 'clean',
  wire: { id: 'wire', opener: '/clear' },
  ...patch,
})
const master = horse({ batonName: 'fable', sessionId: 'm', role: 'mastermind' })
const plan = (
  entries = [row('1')],
  seat = horse(),
  masters = [master],
  firstSeen = new Map<string, string>(),
) =>
  planAutoDispatch({
    plannedAt: 'now',
    entries,
    seats: [...masters, seat],
    firstSeen,
  })

describe('MAR-3293 dispatch decisions', () => {
  it('R1 all eight label combinations admit exactly one candidate; absent keys are not labels', () => {
    const entries = Array.from({ length: 8 }, (_, n) =>
      row(String(n), {
        fact: {
          ...ready,
          groomed: !!(n & 1),
          grounded: !!(n & 2),
          dispatch: !!(n & 4),
        },
      }),
    )
    const result = plan(entries)
    expect(result.order.horse).toEqual(['7'])
    expect(Object.keys(result.words)).toHaveLength(8)
    expect(result.words['7'].kind).toBe('would-start')
    const old = plan([
      row('old', {
        fact: { logicalStatus: null, branchName: null, updatedAt: null },
      }),
    ])
    expect(old.words.old).toEqual({
      kind: 'needs-labels',
      missing: ['groomed', 'grounded', 'dispatch'],
    })
    expect(old.order.horse).toBeUndefined()
    expect(plan([row('1', { blocked: true })]).words['1']).toEqual({
      kind: 'blocked',
    })
    expect(plan([row('1', { blocked: true })]).order.horse).toBeUndefined()
  })
  it('R1 adjacent precedence from labels through lane and queue', () => {
    expect(
      plan([row('1', { blocked: true, fact: { ...ready, grounded: false } })])
        .words['1'].kind,
    ).toBe('needs-labels')
    expect(
      plan([row('1', { blocked: true })], horse({ batonName: 'other' })).words[
        '1'
      ].kind,
    ).toBe('blocked')
    expect(
      plan([row('1')], horse({ batonName: 'other', sessionId: null })).words[
        '1'
      ].kind,
    ).toBe('seat-not-in-crew')
    expect(
      plan([row('1')], horse({ sessionId: null }), []).words['1'].kind,
    ).toBe('seat-no-conversation')
    expect(plan([row('1')], horse({ wire: null }), []).words['1'].kind).toBe(
      'no-mastermind',
    )
    expect(
      plan([row('1')], horse({ wire: null, availability: 'turn' })).words['1']
        .kind,
    ).toBe('no-wire')
    const entries = [row('1'), row('2'), row('3', { state: 'returned' })]
    expect(
      plan(entries, horse({ availability: 'turn', lane: 'dirty' })).words['1'],
    ).toEqual({ kind: 'seat-busy', why: 'turn' })
    expect(plan(entries, horse({ lane: 'dirty' })).words['1'].kind).toBe(
      'seat-holds',
    )
    expect(
      plan(entries.slice(0, 2), horse({ lane: 'dirty' })).words['2'],
    ).toEqual({ kind: 'lane', state: 'dirty' })
  })
  it('R2 returned work occupies capacity; vacant limits one and two', () => {
    const entries = [row('1'), row('2')]
    expect(plan([...entries, row('3', { state: 'returned' })]).words).toEqual({
      '1': { kind: 'seat-holds', identifier: 'MAR-3' },
      '2': { kind: 'seat-holds', identifier: 'MAR-3' },
    })
    expect(plan(entries).words).toEqual({
      '1': { kind: 'would-start', wire: { id: 'wire', opener: '/clear' } },
      '2': { kind: 'queued-behind', identifier: 'MAR-1' },
    })
    expect(
      Object.values(plan(entries, horse({ wipLimit: 2 })).words).map(
        (w) => w.kind,
      ),
    ).toEqual(['would-start', 'would-start'])
  })
  it('R3 priority wins before first-seen, zero/null rank last, then numeric issue tiebreak', () => {
    const entries = [
      row('3', { fact: { ...ready, priority: 3 } }),
      row('4', { fact: { ...ready, priority: 1 } }),
      row('0', { fact: { ...ready, priority: 0 } }),
      row('2', { fact: { ...ready, priority: 1 } }),
      row('10', { fact: { ...ready, priority: null } }),
    ]
    const firstSeen = new Map([
      ['3', 't1'],
      ['4', 't4'],
      ['0', 't0'],
      ['2', 't2'],
      ['10', 't0'],
    ])
    expect(plan(entries, horse(), [master], firstSeen).order.horse).toEqual([
      '2',
      '4',
      '3',
      '0',
      '10',
    ])
  })
  it('R5 warns about multiple masterminds in seat order and preserves wire metadata', () => {
    const result = plan([row('1')], horse(), [
      master,
      { ...master, batonName: 'second' },
    ])
    expect(result.warnings).toEqual([
      'Multiple mastermind seats; using fable (first in seat order).',
    ])
    expect(result.words['1']).toEqual({
      kind: 'would-start',
      wire: { id: 'wire', opener: '/clear' },
    })
  })
  it('only assigned entries naming seats receive words', () => {
    expect(
      plan([
        row('1', { seat: null }),
        row('2', { state: 'working' }),
        row('3', { state: 'done' }),
      ]).words,
    ).toEqual({})
  })
})
