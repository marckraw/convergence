import { describe, expect, it } from 'vitest'
import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import {
  formatCodexRemainingPercent,
  getCodexUsageTone,
  getCodexWindow,
  getPrimaryCodexWindow,
  shouldShowCodexUsagePill,
} from './codex-usage-pill.pure'

const snapshot: ProviderQuotaSnapshot = {
  providerId: 'codex',
  status: 'available',
  source: 'provider-api',
  planType: 'pro',
  windows: [
    {
      kind: 'weekly',
      label: 'Weekly usage limit',
      usedPercent: 5,
      remainingPercent: 95,
      windowMinutes: 10_080,
      resetsAt: '2026-05-26T22:00:00.000Z',
    },
    {
      kind: 'five-hour',
      label: '5 hour usage limit',
      usedPercent: 13,
      remainingPercent: 87,
      windowMinutes: 300,
      resetsAt: '2026-05-21T15:21:00.000Z',
    },
  ],
  credits: null,
  limitReachedType: null,
  lastCheckedAt: '2026-05-21T12:00:00.000Z',
  stale: false,
}

describe('Codex usage pill helpers', () => {
  // The pill reports the Codex CLI's own ChatGPT quota. A Pi session bills
  // through Pi's credentials even when the model happens to be an OpenAI one,
  // so showing Codex's numbers there is simply wrong.
  it('shows only for Codex sessions', () => {
    expect(shouldShowCodexUsagePill({ providerId: 'codex' })).toBe(true)
    // Pi no longer qualifies at all, whatever model it runs — the signature
    // does not even take a model id any more.
    expect(shouldShowCodexUsagePill({ providerId: 'pi' })).toBe(false)
    expect(shouldShowCodexUsagePill({ providerId: 'claude-code' })).toBe(false)
  })

  it('uses the five-hour window as the primary composer value', () => {
    expect(getPrimaryCodexWindow(snapshot)?.remainingPercent).toBe(87)
    expect(getCodexWindow(snapshot, 'weekly')?.remainingPercent).toBe(95)
  })

  it('formats remaining percent and color tone', () => {
    expect(formatCodexRemainingPercent(87.3)).toBe('87%')
    expect(formatCodexRemainingPercent(null)).toBe('--')
    expect(getCodexUsageTone(87)).toBe('green')
    expect(getCodexUsageTone(40)).toBe('amber')
    expect(getCodexUsageTone(15)).toBe('red')
    expect(getCodexUsageTone(null)).toBe('muted')
  })
})
