import { describe, expect, it } from 'vitest'
import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import {
  formatClaudeUsagePillValue,
  getClaudeWindow,
  getPrimaryClaudeWindow,
  shouldShowClaudeUsagePill,
} from './claude-usage-pill.pure'

const snapshot: ProviderQuotaSnapshot = {
  providerId: 'claude-code',
  status: 'available',
  source: 'local-usage-log',
  planType: null,
  windows: [
    {
      kind: 'weekly',
      label: "This week's Claude usage",
      usedPercent: 42,
      remainingPercent: 58,
      windowMinutes: 10_080,
      resetsAt: '2026-06-21T00:00:00.000Z',
      displayMode: 'observed-usage',
      valueLabel: '371.9M tokens, $370.55',
      resetLabel: 'Ends',
    },
    {
      kind: 'five-hour',
      label: 'Current 5-hour Claude usage',
      usedPercent: 22,
      remainingPercent: 78,
      windowMinutes: 300,
      resetsAt: '2026-06-17T19:00:00.000Z',
      displayMode: 'observed-usage',
      valueLabel: '9.4M tokens, $6.81',
      resetLabel: 'Ends',
    },
  ],
  credits: null,
  limitReachedType: null,
  lastCheckedAt: '2026-06-17T15:03:00.000Z',
  stale: false,
}

describe('Claude usage pill helpers', () => {
  it('shows for Claude Code selections only', () => {
    expect(shouldShowClaudeUsagePill({ providerId: 'claude-code' })).toBe(true)
    expect(shouldShowClaudeUsagePill({ providerId: 'codex' })).toBe(false)
    expect(shouldShowClaudeUsagePill({ providerId: 'pi' })).toBe(false)
  })

  it('uses the five-hour window as the primary composer value', () => {
    expect(getPrimaryClaudeWindow(snapshot)?.valueLabel).toBe(
      '9.4M tokens, $6.81',
    )
    expect(getClaudeWindow(snapshot, 'weekly')?.valueLabel).toBe(
      '371.9M tokens, $370.55',
    )
  })

  it('formats the compact pill token label from the observed usage value', () => {
    expect(formatClaudeUsagePillValue(getPrimaryClaudeWindow(snapshot))).toBe(
      '9.4M',
    )
    expect(formatClaudeUsagePillValue(null)).toBe('--')
  })
})
