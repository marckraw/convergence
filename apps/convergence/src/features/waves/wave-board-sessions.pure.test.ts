import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import { boundCrewWith, ledgerEntry, residentSeat } from './wave-rows.fixture'
import {
  waveBoardSessionIds,
  waveBoardSessionKey,
  waveBoardSessionsFromKey,
} from './wave-board-sessions.pure'

const seat = {
  id: 'seat',
  status: 'idle',
  attention: 'none',
  activity: null,
  executionHost: 'local',
} as SessionSummary

describe('MAR-3379: the closed set of Loom session facts', () => {
  it('references crew members and row sessions, including missing sessions', () => {
    expect([
      ...waveBoardSessionIds(
        [
          boundCrewWith('crew', 'Crew', [
            residentSeat('seat'),
            residentSeat('seat'),
          ]),
        ],
        [
          ledgerEntry({ issueIdentifier: 'EX-1', sessionId: 'missing' }),
          ledgerEntry({ issueIdentifier: 'EX-2', sessionId: null }),
        ],
      ),
    ]).toEqual(['session-seat', 'missing'])
  })

  it('ignores other sessions, unused fields and list ordering', () => {
    const ids = new Set(['seat'])
    expect(
      waveBoardSessionKey(
        [
          { ...seat, id: 'other' },
          { ...seat, updatedAt: 'new', name: 'new' },
        ],
        ids,
      ),
    ).toBe(waveBoardSessionKey([seat], ids))
    expect(
      waveBoardSessionsFromKey(waveBoardSessionKey([seat], ids)).get('seat'),
    ).toEqual(seat)
  })

  it.each([
    { status: 'running' },
    { attention: 'host-unreachable' },
    { activity: 'compacting' },
    { executionHost: 'remote' },
  ] as const)('keeps %j live', (patch) => {
    const ids = new Set(['seat'])
    expect(waveBoardSessionKey([{ ...seat, ...patch }], ids)).not.toBe(
      waveBoardSessionKey([seat], ids),
    )
  })

  it('distinguishes arrival and removal of a referenced session', () => {
    const ids = new Set(['seat'])
    expect(waveBoardSessionKey([], ids)).not.toBe(
      waveBoardSessionKey([seat], ids),
    )
    expect(waveBoardSessionsFromKey(waveBoardSessionKey([], ids)).size).toBe(0)
  })
})
