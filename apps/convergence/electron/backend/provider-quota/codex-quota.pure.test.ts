import { describe, expect, it } from 'vitest'
import {
  buildCodexQuotaAuthError,
  mapCodexRateLimitsToQuotaSnapshot,
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

// Fixture: verbatim `account/rateLimits/read` response from codex 0.145.0,
// probed on this machine 2026-07-27 (MAR-2037). Note camelCase throughout —
// the app-server payload is shaped differently from the chatgpt.com scrape.
describe('mapCodexRateLimitsToQuotaSnapshot', () => {
  const liveTape = {
    rateLimits: {
      limitId: 'codex',
      limitName: null,
      primary: {
        usedPercent: 1,
        windowDurationMins: 10080,
        resetsAt: 1785612249,
      },
      secondary: null,
      credits: { hasCredits: false, unlimited: false, balance: '0' },
      individualLimit: null,
      spendControlReached: false,
      planType: 'pro',
      rateLimitReachedType: null,
    },
    rateLimitsByLimitId: {
      codex: {
        limitId: 'codex',
        limitName: null,
        primary: {
          usedPercent: 1,
          windowDurationMins: 10080,
          resetsAt: 1785612249,
        },
        secondary: null,
      },
      codex_bengalfox: {
        limitId: 'codex_bengalfox',
        limitName: 'GPT-5.3-Codex-Spark',
        primary: {
          usedPercent: 0,
          windowDurationMins: 10080,
          resetsAt: 1785790627,
        },
        secondary: null,
      },
    },
    rateLimitResetCredits: {
      availableCount: 2,
      credits: [{ id: 'RateLimitResetCredit_abc', status: 'available' }],
    },
  }

  it('maps the live 0.145 tape', () => {
    const snapshot = mapCodexRateLimitsToQuotaSnapshot(
      liveTape,
      '2026-07-27T20:00:00.000Z',
    )

    expect(snapshot.providerId).toBe('codex')
    expect(snapshot.status).toBe('available')
    expect(snapshot.source).toBe('provider-api')
    expect(snapshot.planType).toBe('pro')
    expect(snapshot.credits).toEqual({
      hasCredits: false,
      unlimited: false,
      balance: '0',
    })
    expect(snapshot.limitReachedType).toBeNull()

    // 10080 minutes is the weekly window.
    expect(snapshot.windows[0]).toEqual({
      kind: 'weekly',
      label: 'Weekly usage limit',
      usedPercent: 1,
      remainingPercent: 99,
      windowMinutes: 10080,
      resetsAt: new Date(1785612249 * 1000).toISOString(),
    })

    // Named per-limit buckets ride along as extra windows.
    const spark = snapshot.windows.find(
      (window) => window.label === 'GPT-5.3-Codex-Spark',
    )
    expect(spark).toMatchObject({ kind: 'other', usedPercent: 0 })
    // The primary bucket must not be duplicated by rateLimitsByLimitId.
    expect(
      snapshot.windows.filter((window) => window.kind === 'weekly'),
    ).toHaveLength(1)
  })

  it('classifies a five-hour primary window and a weekly secondary', () => {
    const snapshot = mapCodexRateLimitsToQuotaSnapshot(
      {
        rateLimits: {
          limitId: 'codex',
          primary: {
            usedPercent: 40,
            windowDurationMins: 300,
            resetsAt: 1785612249,
          },
          secondary: {
            usedPercent: 12,
            windowDurationMins: 10080,
            resetsAt: 1785790627,
          },
          planType: 'plus',
          rateLimitReachedType: 'primary',
        },
      },
      '2026-07-27T20:00:00.000Z',
    )

    expect(snapshot.windows.map((window) => window.kind)).toEqual([
      'five-hour',
      'weekly',
    ])
    expect(snapshot.windows[0]?.remainingPercent).toBe(60)
    expect(snapshot.limitReachedType).toBe('primary')
  })

  it('works when reset credits are absent', () => {
    const snapshot = mapCodexRateLimitsToQuotaSnapshot(
      {
        rateLimits: {
          primary: { usedPercent: 3, windowDurationMins: 300 },
          planType: 'pro',
        },
      },
      '2026-07-27T20:00:00.000Z',
    )

    expect(snapshot.status).toBe('available')
    expect(snapshot.windows).toHaveLength(1)
    expect(snapshot.windows[0]?.resetsAt).toBeNull()
    expect(snapshot.credits).toBeNull()
  })

  it('throws when the payload carries no rate limits', () => {
    expect(() =>
      mapCodexRateLimitsToQuotaSnapshot({}, '2026-07-27T20:00:00.000Z'),
    ).toThrow()
  })
})
