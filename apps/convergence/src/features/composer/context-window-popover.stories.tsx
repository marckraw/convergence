import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { ContextWindowPopover } from './context-window-popover.presentational'

const meta = {
  title: 'Features/Composer/ContextWindowPopover',
  component: ContextWindowPopover,
  args: {
    contextWindow: {
      availability: 'available',
      source: 'provider',
      usedTokens: 152000,
      windowTokens: 200000,
      usedPercentage: 76,
      remainingPercentage: 24,
    },
    tone: 'warning',
    alertLine: 'Over your 75% alert threshold.',
    compaction: { visible: true, enabled: true, reason: null },
    compactionCheckedAtRun: false,
    compacting: false,
    drillRunning: false,
    actionMessage: null,
    drill: {
      visible: true,
      enabled: true,
      label: 'Run the drill',
      reason: null,
      cancel: { visible: false, enabled: false, reason: null },
    },
    cancelRefusal: null,
    onCompact: fn(),
    onRunDrill: fn(),
    onCancelDrill: fn(),
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
} satisfies Meta<typeof ContextWindowPopover>

export default meta

type Story = StoryObj<typeof meta>

/** Over the threshold: the room left, the reading, Compact and the drill. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', { name: 'Context window 24% remaining' }),
    ).toBeVisible()
    const panel = await screen.findByRole('dialog', { name: 'Context window' })
    await waitFor(() => expect(panel).toBeVisible())
    await expect(
      screen.getByText('152,000 tokens', { exact: false }),
    ).toBeVisible()
    await expect(
      screen.getByText('Over your 75% alert threshold.'),
    ).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Compact context' }),
    )
    await expect(args.onCompact).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Run the drill' }))
    await expect(args.onRunDrill).toHaveBeenCalledOnce()
  },
}

/** A drill under way: its beat, Compact held, and a Cancel. */
export const Busy: Story = {
  args: {
    drillRunning: true,
    drill: {
      visible: true,
      enabled: false,
      label: 'Sealing memory…',
      reason: null,
      cancel: { visible: true, enabled: true, reason: null },
    },
  },
  play: async ({ args, userEvent }) => {
    await expect(
      await screen.findByRole('button', { name: 'Compact context' }),
    ).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(args.onCancelDrill).toHaveBeenCalledOnce()
  },
}

/** Compaction failed, and a Cancel was refused: each says so in danger ink. */
export const Failed: Story = {
  args: {
    actionMessage: { tone: 'error', text: 'Compaction failed.' },
    cancelRefusal: 'The drill is compacting and can’t stop now.',
    drill: {
      visible: true,
      enabled: false,
      label: 'Compacting…',
      reason: null,
      cancel: { visible: true, enabled: false, reason: null },
    },
  },
  play: async () => {
    await expect(await screen.findByText('Compaction failed.')).toBeVisible()
    await expect(
      screen.getByText('The drill is compacting and can’t stop now.'),
    ).toBeVisible()
  },
}

/** Nothing reported for this session yet. */
export const Empty: Story = {
  args: {
    contextWindow: null,
    tone: 'neutral',
    alertLine: null,
    compaction: { visible: false, enabled: false, reason: null },
    drill: {
      visible: false,
      enabled: false,
      label: 'Run the drill',
      reason: null,
      cancel: { visible: false, enabled: false, reason: null },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Context window unavailable' }),
    ).toBeVisible()
    await expect(
      await screen.findByText(
        'Context usage has not been reported for this session yet.',
      ),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
