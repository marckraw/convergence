import type { Meta, StoryObj } from '@storybook/react-vite'
import { Folder, GitBranch } from 'lucide-react'
import { expect, fn } from 'storybook/test'
import { DraftStart } from './draft-start.presentational'

const meta = {
  title: 'Widgets/SessionView/DraftStart',
  component: DraftStart,
  args: {
    title: 'convergence',
    icon: <GitBranch />,
    place: 'Starting in worktree',
    placeName: 'ui/ds4-sweep-conv',
    action: { label: 'Use main repo', onClick: fn() },
  },
  decorators: [
    (Story) => (
      <div className="flex w-160 max-w-full flex-col items-center rounded-md bg-canvas p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DraftStart>

export default meta

type Story = StoryObj<typeof meta>

/** A project session about to start in a worktree, with the way back to the main repo. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByText('What would you like to work on?'),
    ).toBeVisible()
    await expect(canvas.getByText('ui/ds4-sweep-conv')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Use main repo' }))
    await expect(args.action?.onClick).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** In the main repo: nothing to switch to. */
export const MainRepo: Story = {
  args: {
    place: 'Starting in main repo',
    placeName: undefined,
    action: undefined,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Starting in main repo')).toBeVisible()
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** A Space attempt: its Space's name, and a way back to the Space. */
export const Space: Story = {
  args: {
    title: 'Design system sweep',
    icon: <Folder />,
    place: 'Starting in Space',
    placeName: 'Design system sweep',
    action: { label: 'Open Space', onClick: fn() },
  },
}

/** A long name is cut short; its tooltip holds it whole. */
export const Long: Story = {
  args: {
    title:
      'A project whose name is far too long for the middle of an empty conversation, however wide the window',
  },
  play: async ({ canvas }) => {
    const title = canvas.getByText(/A project whose name/)
    await expect(title).toHaveAttribute('data-tooltip-when', 'truncated')
    await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
  },
}
