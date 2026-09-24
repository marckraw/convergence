import { describe, expect, it } from 'vitest'
import { entryBelongsToSeat, seatTicket } from './seat-ticket.pure'
import type { WorkLedgerEntry } from './work-ledger.types'

const entry: WorkLedgerEntry = {
  id: 'row',
  crewId: 'crew',
  issueId: 'issue',
  issueIdentifier: 'MAR-1',
  issueTitle: 'Work',
  issueUrl: 'https://example.test/issue',
  seat: 'opus',
  wave: null,
  lap: 1,
  state: 'working',
  trackerStatus: 'In Progress',
  groundedAt: null,
  seenAt: '2026-09-24',
  fact: { logicalStatus: 'in-progress', branchName: null, updatedAt: null },
  sessionId: 'session',
  pr: null,
  verdict: null,
  verdictSettleId: null,
  verdictNote: null,
  blocked: false,
  hostLiveness: null,
  dispatch: null,
}

describe('seat identity and ledger ticket', () => {
  it('joins residents by conversation and recipes by name, within the crew', () => {
    expect(
      entryBelongsToSeat(
        entry,
        { sessionId: 'session', batonName: 'renamed' },
        'crew',
      ),
    ).toBe(true)
    expect(
      entryBelongsToSeat(
        entry,
        { sessionId: 'other', batonName: 'opus' },
        'crew',
      ),
    ).toBe(false)
    expect(
      entryBelongsToSeat(entry, { sessionId: null, batonName: 'opus' }, 'crew'),
    ).toBe(true)
    expect(
      entryBelongsToSeat(entry, { sessionId: null, batonName: null }, 'crew'),
    ).toBe(false)
    expect(
      entryBelongsToSeat(
        entry,
        { sessionId: 'session', batonName: 'opus' },
        'other',
      ),
    ).toBe(false)
  })

  it('a recipe can own working work, and returned work is not its active ticket', () => {
    const seat = { sessionId: null, batonName: 'opus' }
    expect(seatTicket([entry], 'crew', seat)).toBe(entry)
    expect(
      seatTicket([{ ...entry, state: 'returned' }], 'crew', seat),
    ).toBeNull()
  })
})
