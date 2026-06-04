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

  it('renders provider quota details when available', () => {
    const snapshot: ProviderQuotaSnapshot = {
      providerId: 'cursor',
      status: 'available',
      source: 'provider-api',
      planType: 'member',
      windows: [],
      credits: null,
      limitReachedType: null,
      details: [
        'User: developer@example.com',
        'Source: official Cursor Admin API team spend endpoint',
        'Availability: Cursor team admins only; personal Pro accounts do not expose this usage endpoint.',
      ],
      lastCheckedAt: '2026-06-03T12:00:00.000Z',
      stale: false,
    }

    render(<ProviderUsageCard snapshot={snapshot} />)

    expect(screen.getByText('User: developer@example.com')).toBeInTheDocument()
    expect(
      screen.getByText('Source: official Cursor Admin API team spend endpoint'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Availability: Cursor team admins only; personal Pro accounts do not expose this usage endpoint.',
      ),
    ).toBeInTheDocument()
  })
})
