import type { Meta, StoryObj } from '@storybook/react-vite'
import { Clock3 } from 'lucide-react'
import { expect } from 'storybook/test'
import { SessionHeaderDetailRow } from './session-header-detail-row.presentational'

const meta = {
  title: 'Widgets/SessionView/SessionHeaderDetailRow',
  component: SessionHeaderDetailRow,
  args: {
    icon: <Clock3 className="h-3.5 w-3.5" aria-hidden />,
    label: 'Elapsed',
    value: '12m 40s',
  },
  decorators: [
    (Story) => (
      <div className="w-72 rounded-md border border-line bg-raised">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SessionHeaderDetailRow>

export default meta

type Story = StoryObj<typeof meta>

/** One fact in the header's Details: an icon, what it is, and its value. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Elapsed')).toBeVisible()
    await expect(canvas.getByText('12m 40s')).toBeVisible()
  },
}

/** A value too long for the row is cut short at its end. */
export const Long: Story = {
  args: {
    label: 'Working dir',
    value:
      '/Users/marckraw/Projects/Private/convergence/.claude/worktrees/agent-ace62d03d1b065b41',
  },
  play: async ({ args, canvas }) => {
    const value = canvas.getByText(args.value)
    await expect(value.scrollWidth).toBeGreaterThan(value.clientWidth)
  },
}

/** Without an icon the label keeps its column. */
export const Empty: Story = {
  args: { icon: undefined, label: 'Branch', value: 'ui/ds4-stories-conv' },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
