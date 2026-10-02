import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { CodexUsageQuotaRow } from './codex-usage-quota-row.presentational'

const meta = {
  title: 'Features/Composer/CodexUsageQuotaRow',
  component: CodexUsageQuotaRow,
  args: {
    label: '5 hours',
    remaining: 64,
    reset: '2026-10-01T18:30:00.000Z',
  },
  decorators: [
    (Story) => (
      <div className="w-72 rounded-md border border-line bg-raised p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CodexUsageQuotaRow>

export default meta

type Story = StoryObj<typeof meta>

/** One ChatGPT quota window: what is left, and when it resets. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('5 hours')).toBeVisible()
    await expect(canvas.getByText('64%')).toBeVisible()
    // The reset is a Timestamp (CONV-22): a <time> after the word.
    await expect(canvas.getByText(/^Resets/)).toBeVisible()
    await expect(
      canvas.getByText(/^Resets/).querySelector('time'),
    ).not.toBeNull()
  },
}

/** Nothing reported: no percentage and no reset time. */
export const Empty: Story = {
  args: { label: 'Weekly', remaining: null, reset: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('--')).toBeVisible()
    await expect(canvas.getByText('Reset time unavailable')).toBeVisible()
  },
}

/** Used up. */
export const Failed: Story = {
  args: { label: 'Weekly', remaining: 0, reset: '2026-10-05T09:00:00.000Z' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('0%')).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
