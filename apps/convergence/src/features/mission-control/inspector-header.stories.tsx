import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowRight } from 'lucide-react'
import { expect, fn } from 'storybook/test'
import { crewTokens } from '@convergence/ui'
import { CrewMark } from './crew-mark.presentational'
import { InspectorHeader } from './inspector-header.presentational'

const meta = {
  title: 'Features/MissionControl/InspectorHeader',
  component: InspectorHeader,
  args: {
    eyebrow: 'New connection',
    title: (
      <span className="flex items-center gap-1.5">
        Fable
        <ArrowRight aria-hidden className="size-3.5" />
        opus-mac
      </span>
    ),
    subtitle: 'Not saved yet',
    closeLabel: 'Close the connection panel',
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-85 border-l border-hairline px-4 py-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InspectorHeader>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A canvas inspector's head: an eyebrow, the title, a muted line, and one ✕
 * named for what it closes.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Fable',
    )
    await expect(canvas.getByText('Not saved yet')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Close the connection panel' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A crew's settings: its swatch leads, its long name is cut short. */
export const Long: Story = {
  args: {
    eyebrow: undefined,
    leading: (
      <CrewMark
        crew={{
          name: 'convergence development',
          emoji: '🐎',
          accentColor: crewTokens.violet,
        }}
        variant="swatch"
        className="mt-1"
      />
    ),
    title:
      'convergence development — the crew that builds Convergence itself, every lane',
    titleClassName: 'truncate',
    subtitle: 'Crew settings',
    closeLabel: 'Close crew settings',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 3 })).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Close crew settings' }),
    ).toBeVisible()
  },
}
