import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import { ProviderUsageFields } from './provider-usage.presentational'

const codex: ProviderQuotaSnapshot = {
  providerId: 'codex',
  status: 'available',
  source: 'provider-api',
  planType: 'pro',
  windows: [
    {
      kind: 'weekly',
      label: 'Weekly',
      usedPercent: 38,
      remainingPercent: 62,
      windowMinutes: 10080,
      resetsAt: '2026-10-05T08:00:00.000Z',
    },
    {
      kind: 'five-hour',
      label: '5-hour',
      usedPercent: 81,
      remainingPercent: 19,
      windowMinutes: 300,
      resetsAt: '2026-10-01T14:30:00.000Z',
    },
  ],
  credits: { hasCredits: true, unlimited: false, balance: '1,250' },
  limitReachedType: null,
  lastCheckedAt: '2026-10-01T12:00:00.000Z',
  stale: false,
}

const claude: ProviderQuotaSnapshot = {
  providerId: 'claude-code',
  status: 'available',
  source: 'provider-event',
  planType: null,
  windows: [
    {
      kind: 'other',
      label: 'This session',
      usedPercent: 24,
      remainingPercent: 76,
      windowMinutes: null,
      resetsAt: '2026-10-01T17:00:00.000Z',
      displayMode: 'observed-usage',
      valueLabel: '412k tokens',
      resetLabel: 'Ends',
    },
  ],
  credits: null,
  limitReachedType: 'rate_limited',
  lastCheckedAt: '2026-10-01T11:40:00.000Z',
  stale: true,
}

const cursor: ProviderQuotaSnapshot = {
  providerId: 'cursor',
  status: 'unavailable',
  source: 'manual',
  reason:
    'Cursor does not report usage limits to agents. Open the dashboard to see what this account has spent.',
  usageUrl: 'https://cursor.com/dashboard',
  lastCheckedAt: '2026-10-01T12:00:00.000Z',
  stale: false,
}

const antigravity: ProviderQuotaSnapshot = {
  providerId: 'antigravity',
  status: 'available',
  source: 'provider-api',
  planType: 'AI Pro',
  windows: [],
  credits: { hasCredits: true, unlimited: true, balance: null },
  limitReachedType: null,
  lastCheckedAt: '2026-10-01T12:00:00.000Z',
  stale: false,
}

const meta = {
  title: 'Features/AppSettings/ProviderUsage',
  component: ProviderUsageFields,
  args: {
    snapshots: [codex, claude, cursor, antigravity],
    isLoading: false,
    onRefresh: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-180">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProviderUsageFields>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A card per provider: live windows (the five-hour first), observed usage,
 * credits, a provider that cannot report, and links to each usage page.
 */
export const Default: Story = {
  parameters: {
    a11y: {
      config: {
        // a11y-known: each usage bar is a div with an aria-label and no role (a meter would carry it) — fixed by the sweep (DS4)
        rules: [{ id: 'aria-prohibited-attr', enabled: false }],
      },
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh' }))
    await expect(args.onRefresh).toHaveBeenCalledOnce()
    const codexCard = canvas.getByText('Codex').closest('section')
    await expect(codexCard).not.toBeNull()
    const rows = within(codexCard as HTMLElement).getAllByText(/% remaining$/)
    await expect(rows.map((row) => row.textContent)).toEqual([
      '19% remaining',
      '62% remaining',
    ])
    await expect(canvas.getByText('412k tokens')).toBeVisible()
    await expect(canvas.getByText(/\(stale\)/)).toBeVisible()
    await expect(canvas.getByText('Cursor usage unavailable')).toBeVisible()
    await expect(canvas.getByText('Unlimited')).toBeVisible()
    await expect(
      canvas.getByText('No active rate-limit windows were reported.'),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Credits' })).toBeVisible()
  },
}

/** Busy, the first check: nothing to show yet, and Refresh waits. */
export const Busy: Story = {
  args: { snapshots: [], isLoading: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Checking provider usage limits...'),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  },
}

/** Failed: every provider is unavailable, each saying why. */
export const Failed: Story = {
  args: {
    snapshots: [
      {
        providerId: 'codex',
        status: 'unavailable',
        source: 'provider-api',
        reason: 'The usage endpoint answered 401: sign in to Codex again.',
        lastCheckedAt: '2026-10-01T12:00:00.000Z',
        stale: false,
      },
      cursor,
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Codex usage unavailable')).toBeVisible()
    await expect(canvas.getByText(/answered 401/)).toBeVisible()
  },
}

/** Empty: no provider reports usage. */
export const Empty: Story = {
  args: { snapshots: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Refresh' })).toBeEnabled()
    await expect(
      canvas.queryByText('Checking provider usage limits...'),
    ).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
