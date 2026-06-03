import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import { ProviderUsageCard } from './provider-usage-card.presentational'

describe('ProviderUsageCard', () => {
  it('labels manual provider snapshots as manual usage pages', () => {
    const snapshot: ProviderQuotaSnapshot = {
      providerId: 'claude-code',
      status: 'unavailable',
      source: 'manual',
      reason:
        'Claude Code does not expose these reset windows reliably to Convergence.',
      usageUrl: 'https://claude.ai/new#settings/usage',
      lastCheckedAt: '2026-06-03T12:00:00.000Z',
      stale: false,
    }

    render(<ProviderUsageCard snapshot={snapshot} />)

    expect(screen.getByText('Source: manual usage page')).toBeInTheDocument()
    expect(
      screen.queryByText('Source: provider runtime event'),
    ).not.toBeInTheDocument()
  })
})
