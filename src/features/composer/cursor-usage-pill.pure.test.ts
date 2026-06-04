import { describe, expect, it } from 'vitest'
import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import {
  formatCursorWindowLabel,
  getPrimaryCursorWindow,
} from './cursor-usage-pill.pure'

const snapshot: ProviderQuotaSnapshot = {
  providerId: 'cursor',
  status: 'available',
  source: 'provider-api',
  planType: 'member',
  windows: [
    {
      kind: 'other',
      label: 'On-demand spend limit',
      usedPercent: 25,
      remainingPercent: 75,
      windowMinutes: null,
      resetsAt: '2026-06-21T21:20:00.000Z',
    },
  ],
  credits: null,
  limitReachedType: null,
  lastCheckedAt: '2026-05-22T12:00:00.000Z',
  stale: false,
}

describe('Cursor usage pill helpers', () => {
  it('uses the first reported Cursor window as the primary value', () => {
    expect(getPrimaryCursorWindow(snapshot)?.remainingPercent).toBe(75)
    expect(getPrimaryCursorWindow(null)).toBeNull()
    expect(
      getPrimaryCursorWindow({
        providerId: 'cursor',
        status: 'unavailable',
        source: 'provider-api',
        reason: 'Unavailable.',
        lastCheckedAt: '2026-05-22T12:00:00.000Z',
        stale: false,
      }),
    ).toBeNull()
  })

  it('shortens on-demand window labels', () => {
    expect(formatCursorWindowLabel(snapshot.windows[0])).toBe('On-demand')
    expect(
      formatCursorWindowLabel({
        ...snapshot.windows[0],
        label: 'Included usage',
      }),
    ).toBe('Included usage')
  })
})
