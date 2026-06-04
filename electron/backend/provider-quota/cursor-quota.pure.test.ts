import { describe, expect, it } from 'vitest'
import {
  buildCursorQuotaUnavailableSnapshot,
  mapCursorTeamSpendPayloadToQuotaSnapshot,
} from './cursor-quota.pure'

describe('mapCursorTeamSpendPayloadToQuotaSnapshot', () => {
  it('maps official Cursor team spend into an on-demand spend window', () => {
    const snapshot = mapCursorTeamSpendPayloadToQuotaSnapshot(
      {
        teamMemberSpend: [
          {
            spendCents: 2450,
            fastPremiumRequests: 1250,
            name: 'Alex',
            email: 'developer@example.com',
            role: 'member',
            hardLimitOverrideDollars: 100,
          },
        ],
        subscriptionCycleStart: 1_779_398_400_000,
        totalMembers: 1,
        totalPages: 1,
      },
      '2026-05-22T12:00:00.000Z',
    )

    expect(snapshot).toMatchObject({
      providerId: 'cursor',
      status: 'available',
      source: 'provider-api',
      planType: 'member',
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: '$75.50',
      },
      limitReachedType: null,
      lastCheckedAt: '2026-05-22T12:00:00.000Z',
      stale: false,
    })
    expect(snapshot.windows).toEqual([
      {
        kind: 'other',
        label: 'On-demand spend limit',
        usedPercent: 24.5,
        remainingPercent: 75.5,
        windowMinutes: null,
        resetsAt: '2026-06-21T21:20:00.000Z',
      },
    ])
    expect(snapshot.details).toEqual([
      'User: developer@example.com',
      'Current spend: $24.50',
      'Hard limit: $100.00',
      'Fast premium requests: 1,250',
      'Source: official Cursor Admin API team spend endpoint',
    ])
  })

  it('requires an email when team spend returns multiple members', () => {
    expect(() =>
      mapCursorTeamSpendPayloadToQuotaSnapshot(
        {
          teamMemberSpend: [
            { spendCents: 100, email: 'a@example.com' },
            { spendCents: 200, email: 'b@example.com' },
          ],
        },
        '2026-05-22T12:00:00.000Z',
      ),
    ).toThrow(/CURSOR_USAGE_EMAIL/)
  })

  it('selects a requested team member by email', () => {
    const snapshot = mapCursorTeamSpendPayloadToQuotaSnapshot(
      {
        teamMemberSpend: [
          { spendCents: 100, email: 'a@example.com' },
          {
            spendCents: 200,
            email: 'b@example.com',
            hardLimitOverrideDollars: 10,
          },
        ],
      },
      '2026-05-22T12:00:00.000Z',
      { email: 'B@example.com' },
    )

    expect(snapshot.details?.[0]).toBe('User: b@example.com')
    expect(snapshot.windows[0]?.usedPercent).toBe(20)
  })
})

describe('cursor quota pure helpers', () => {
  it('builds unavailable snapshots with a dashboard link', () => {
    expect(
      buildCursorQuotaUnavailableSnapshot(
        'Cursor usage unavailable.',
        '2026-05-22T12:00:00.000Z',
      ),
    ).toEqual({
      providerId: 'cursor',
      status: 'unavailable',
      source: 'provider-api',
      reason: 'Cursor usage unavailable.',
      usageUrl: 'https://cursor.com/dashboard',
      lastCheckedAt: '2026-05-22T12:00:00.000Z',
      stale: false,
    })
  })
})
