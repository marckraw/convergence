import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { WorkBlockRow } from './work-block.presentational'

const meta = {
  title: 'Widgets/SessionView/WorkBlock',
  component: WorkBlockRow,
  args: {
    label: 'Read 4 files · searched 2 times · ran 1 command',
    memberCount: 7,
    open: false,
    working: false,
    onToggle: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-144 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WorkBlockRow>

export default meta

type Story = StoryObj<typeof meta>

/** One folded line for a run of tool calls; pressing it opens the run. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const row = canvas.getByRole('button', { name: args.label })
    await expect(row).toHaveAttribute('aria-expanded', 'false')
    // The hint is the app's tooltip, and the row's description (MAR-3616).
    await expect(row).toHaveAttribute('data-tooltip', '7 entries · open')
    await expect(row).toHaveAccessibleDescription('7 entries · open')
    await userEvent.click(row)
    await expect(args.onToggle).toHaveBeenCalledOnce()
    // The keyboard reaches it too.
    await userEvent.keyboard('{Enter}')
    await expect(args.onToggle).toHaveBeenCalledTimes(2)
  },
}

/** Open: the row says so, and its title offers to fold it. */
export const Open: Story = {
  args: { open: true },
  play: async ({ args, canvas }) => {
    const row = canvas.getByRole('button', { name: args.label })
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    await expect(row).toHaveAttribute('data-tooltip', '7 entries · fold')
  },
}

/** The model's one line about the block, under its facts. */
export const WithSentence: Story = {
  args: {
    sentence:
      'Traced the composer focus bug to the popover returning focus to the trigger.',
  },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText(args.sentence ?? '')).toBeVisible()
  },
}

/** Still running: the block keeps growing as calls arrive. */
export const Busy: Story = {
  args: { working: true, memberCount: 1, label: 'Running npm test' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Running npm test' }),
    ).toHaveAttribute('data-tooltip', '1 entry · open')
  },
}

/** Labels and sentences longer than the row stay on one line each. */
export const Long: Story = {
  args: {
    label:
      'Read 38 files · searched 12 times · edited 9 files · ran 14 commands · fetched 2 pages · 1 failed',
    memberCount: 76,
    sentence:
      'Moved every composer popover onto the shared Popover part, then chased three focus regressions through the picker containers and their tests.',
  },
  play: async ({ args, canvas }) => {
    const sentence = canvas.getByText(args.sentence ?? '')
    await expect(sentence.scrollWidth).toBeGreaterThan(sentence.clientWidth)
    await expect(sentence).toHaveAttribute('data-tooltip', args.sentence)
  },
}

export const Dark: Story = {
  ...WithSentence,
  globals: { theme: 'dark' },
}

export const ReducedMotion: Story = {
  ...Open,
  globals: { motion: 'reduced' },
}
