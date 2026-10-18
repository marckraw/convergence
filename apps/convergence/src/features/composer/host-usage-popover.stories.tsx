import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import type { ProviderHostUsage } from '@/entities/session'
import { HostUsagePopover } from './host-usage-popover.presentational'
import { resolveHostUsagePill } from './host-usage-pill.pure'

const NOW = Date.parse('2026-10-18T11:00:00.000Z')

const usage: ProviderHostUsage = {
  observedAt: '2026-10-18T10:00:00.000Z',
  source: 'turn',
  status: 'ok',
  windows: [
    {
      id: 'five_hour',
      span: 'session',
      label: 'Session',
      usedPercent: 36,
      resetsAt: '2026-10-18T13:00:00.000Z',
      modelFamily: null,
    },
    {
      id: 'seven_day',
      span: 'week',
      label: 'Week',
      usedPercent: 78,
      resetsAt: '2026-10-21T09:00:00.000Z',
      modelFamily: null,
    },
  ],
  credits: {
    hasCredits: true,
    unlimited: false,
    balance: '12.50',
    observedAt: '2026-10-18T10:00:00.000Z',
  },
}

function viewOf(value: ProviderHostUsage) {
  return resolveHostUsagePill({
    usage: value,
    providerName: 'Claude Code',
    hostLabel: 'kuba-vps',
    model: { id: 'sonnet', label: 'Claude Sonnet' },
    now: NOW,
  })
}

const meta = {
  title: 'Features/Composer/HostUsagePopover',
  component: HostUsagePopover,
  args: {
    view: viewOf(usage),
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
} satisfies Meta<typeof HostUsagePopover>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A remote host's usage beside its provider (MAR-4272): each window still in
 * force, what is left of it, and the credits as the host reported them.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', {
        name: 'Claude Code on kuba-vps: 22% of the tightest usage limit left',
      }),
    ).toBeVisible()
    const panel = await screen.findByRole('dialog', {
      name: 'Claude Code on kuba-vps usage',
    })
    await waitFor(() => expect(panel).toBeVisible())
    await expect(
      screen.getByRole('meter', { name: 'Week usage limit remaining' }),
    ).toHaveAttribute('aria-valuenow', '22')
    await expect(screen.getByText(/12\.50/)).toBeVisible()
  },
}

/** The host says the account is limited: danger, whatever the numbers say. */
export const Limited: Story = {
  args: { view: viewOf({ ...usage, status: 'limited' }) },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', {
        name: 'Claude Code on kuba-vps: usage limited',
      }),
    ).toBeVisible()
    await expect(
      await screen.findByText(/reports this account as limited/),
    ).toBeVisible()
  },
}

/** Nothing in force for this model: said, not drawn as 0% or 100%. */
export const NoWindow: Story = {
  args: { view: viewOf({ ...usage, windows: [], credits: null }) },
  play: async () => {
    await expect(
      await screen.findByText('No usage limit in force for this model.'),
    ).toBeVisible()
  },
}

/** Closed: only the pill; a resting pointer asks the container to open it. */
export const Closed: Story = {
  args: { open: false },
  play: async ({ args, canvas, userEvent }) => {
    await expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.hover(
      canvas.getByRole('button', { name: /Claude Code on kuba-vps/ }),
    )
    await expect(args.onOpenPanel).toHaveBeenCalled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
