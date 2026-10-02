import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import { CodexUsagePopover } from './codex-usage-popover.presentational'

const available: ProviderQuotaSnapshot = {
  providerId: 'codex',
  status: 'available',
  source: 'provider-api',
  planType: 'pro',
  windows: [
    {
      kind: 'five-hour',
      label: '5 hour usage limit',
      usedPercent: 36,
      remainingPercent: 64,
      windowMinutes: 300,
      resetsAt: '2026-10-02T18:30:00.000Z',
    },
    {
      kind: 'weekly',
      label: 'Weekly usage limit',
      usedPercent: 78,
      remainingPercent: 22,
      windowMinutes: 10_080,
      resetsAt: '2026-10-05T09:00:00.000Z',
    },
  ],
  credits: { hasCredits: true, unlimited: false, balance: '120' },
  limitReachedType: null,
  lastCheckedAt: '2026-10-02T14:07:00.000Z',
  stale: false,
}

const meta = {
  title: 'Features/Composer/CodexUsagePopover',
  component: CodexUsagePopover,
  args: {
    snapshot: available,
    isLoading: false,
    onRefresh: fn(),
    onOpenSettings: fn(),
    open: true,
    onOpenChange: fn(),
    onOpenPanel: fn(),
    onClosePanelSoon: fn(),
  },
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="pt-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CodexUsagePopover>

export default meta

type Story = StoryObj<typeof meta>

/** The pill and its panel: each window's meter, the credits, and Refresh. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', { name: 'Codex usage 64% remaining' }),
    ).toBeVisible()
    const panel = await screen.findByRole('dialog', { name: 'Codex usage' })
    await waitFor(() => expect(panel).toBeVisible())
    await expect(
      screen.getByRole('meter', { name: 'Weekly quota remaining' }),
    ).toHaveAttribute('aria-valuenow', '22')
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh Codex usage' }),
    )
    await expect(args.onRefresh).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await expect(args.onOpenSettings).toHaveBeenCalledOnce()
  },
}

/** Asking: the ring beats, and Refresh spins. */
export const Busy: Story = {
  args: { isLoading: true },
  play: async () => {
    const panel = await screen.findByRole('dialog', { name: 'Codex usage' })
    await waitFor(() => expect(panel).toBeVisible())
  },
}

/** The quota couldn't be read: the reason, in a quiet box. */
export const Failed: Story = {
  args: {
    snapshot: {
      providerId: 'codex',
      status: 'unavailable',
      source: 'provider-api',
      reason: 'Sign in to ChatGPT to see your Codex usage.',
      lastCheckedAt: '2026-10-02T14:07:00.000Z',
      stale: false,
    },
  },
  play: async () => {
    await expect(
      await screen.findByText('Sign in to ChatGPT to see your Codex usage.'),
    ).toBeVisible()
  },
}

/** Closed: only the pill; a resting pointer asks the container to open it. */
export const Closed: Story = {
  args: { open: false },
  play: async ({ args, canvas, userEvent }) => {
    await expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.hover(canvas.getByRole('button', { name: /Codex usage/ }))
    await expect(args.onOpenPanel).toHaveBeenCalled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
