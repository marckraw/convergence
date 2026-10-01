import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { HarnessAlertChip } from './harness-alert-chip.presentational'

const meta = {
  title: 'Widgets/SessionView/HarnessAlertChip',
  component: HarnessAlertChip,
  args: {
    label: 'Harness · retry 3',
    expanded: false,
    onOpen: fn(),
  },
} satisfies Meta<typeof HarnessAlertChip>

export default meta

type Story = StoryObj<typeof meta>

/** The alert names its cause and opens Details at the harness section. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const chip = canvas.getByRole('button', { name: 'Harness · retry 3' })
    await expect(chip).toHaveAttribute('aria-haspopup', 'menu')
    await expect(chip).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(chip)
    await expect(args.onOpen).toHaveBeenCalledOnce()
  },
}

/** Details is open: the chip says so. */
export const Expanded: Story = {
  args: { expanded: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Harness · retry 3' }),
    ).toHaveAttribute('aria-expanded', 'true')
  },
}

/** Several reasons chained: the chip stays its size and keeps the whole label as its title. */
export const Long: Story = {
  args: {
    label:
      'Harness · retry 3 · denied 2 · MCP 2 failed or needing auth · rate limit allowed_warning',
  },
  play: async ({ args, canvas }) => {
    const chip = canvas.getByRole('button', { name: args.label })
    // The full label is the app's tooltip, never a native title (MAR-3616).
    await expect(chip).toHaveAttribute('data-tooltip', args.label)
    await expect(chip).not.toHaveAttribute('title')
    await expect(chip.getBoundingClientRect().width).toBeLessThanOrEqual(240)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
