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
  it('shows for Codex and Pi OpenAI models only', () => {
    expect(
      shouldShowCodexUsagePill({ providerId: 'codex', modelId: 'gpt-5.3' }),
    ).toBe(true)
    expect(
      shouldShowCodexUsagePill({
        providerId: 'pi',
        modelId: 'openai/gpt-5.3-codex',
      }),
    ).toBe(true)
    expect(
      shouldShowCodexUsagePill({
        providerId: 'pi',
        modelId: 'openrouter/openai/gpt-5.3',
      }),
    ).toBe(false)
    expect(
      shouldShowCodexUsagePill({
        providerId: 'claude-code',
        modelId: 'claude-sonnet',
      }),
    ).toBe(false)
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
