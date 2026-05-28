import { describe, expect, it } from 'vitest'
import {
  buildCodexQuotaAuthError,
  mapCodexUsagePayloadToQuotaSnapshot,
  readRecord,
} from './codex-quota.pure'

describe('mapCodexUsagePayloadToQuotaSnapshot', () => {
  it('maps Codex primary and weekly windows with credits', () => {
    const snapshot = mapCodexUsagePayloadToQuotaSnapshot(
      {
        plan_type: 'plus',
        rate_limit: {
          primary_window: {
            used_percent: 4,
            limit_window_seconds: 18_000,
            reset_at: 1_779_398_400,
          },
          secondary_window: {
            used_percent: 12,
            limit_window_seconds: 604_800,
            reset_at: 1_779_916_800,
          },
        },
        credits: {
          has_credits: true,
          unlimited: false,
          balance: '9.50',
        },
      },
      '2026-05-21T12:00:00.000Z',
    )

    expect(snapshot).toMatchObject({
      providerId: 'codex',
      status: 'available',
      planType: 'plus',
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: '9.50',
      },
      lastCheckedAt: '2026-05-21T12:00:00.000Z',
    })
    expect(snapshot.windows).toEqual([
      {
        kind: 'five-hour',
        label: '5 hour usage limit',
        usedPercent: 4,
        remainingPercent: 96,
        windowMinutes: 300,
        resetsAt: '2026-05-21T21:20:00.000Z',
      },
      {
        kind: 'weekly',
        label: 'Weekly usage limit',
        usedPercent: 12,
        remainingPercent: 88,
        windowMinutes: 10080,
        resetsAt: '2026-05-27T21:20:00.000Z',
      },
    ])
  })

  it('maps additional metered feature limits defensively', () => {
    const snapshot = mapCodexUsagePayloadToQuotaSnapshot(
      {
        plan_type: 'pro',
        rate_limit: null,
        additional_rate_limits: [
          {
            limit_name: 'GPT-5.3-Codex-Spark weekly usage limit',
            metered_feature: 'gpt-5.3-codex-spark',
            rate_limit: {
              primary_window: {
                used_percent: 0,
                limit_window_seconds: 604_800,
                reset_at: 1_779_916_800,
              },
            },
          },
        ],
      },
      '2026-05-21T12:00:00.000Z',
    )

    expect(snapshot.windows).toEqual([
      {
        kind: 'other',
        label: 'GPT-5.3-Codex-Spark weekly usage limit',
        usedPercent: 0,
        remainingPercent: 100,
        windowMinutes: 10080,
        resetsAt: '2026-05-27T21:20:00.000Z',
      },
    ])
  })
})

describe('codex quota pure helpers', () => {
  it('reads plain records only', () => {
    expect(readRecord({ ok: true })).toEqual({ ok: true })
    expect(readRecord(null)).toBeNull()
    expect(readRecord([])).toBeNull()
  })

  it('builds auth error snapshots with caller-provided time', () => {
    expect(
      buildCodexQuotaAuthError(
        'Codex auth missing.',
        '2026-05-21T12:00:00.000Z',
      ),
    ).toEqual({
      providerId: 'codex',
      status: 'unavailable',
      source: 'provider-api',
      reason: 'Codex auth missing.',
      lastCheckedAt: '2026-05-21T12:00:00.000Z',
      stale: false,
    })
  })
})
