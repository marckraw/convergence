import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ProjectCreateButton } from './project-create.presentational'

const meta = {
  title: 'Features/ProjectCreate/ProjectCreateButton',
  component: ProjectCreateButton,
  args: {
    onClick: fn(),
  },
} satisfies Meta<typeof ProjectCreateButton>

export default meta

type Story = StoryObj<typeof meta>

/** The empty state's call to action. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open a project' }),
    )
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}

/** Small and outlined, as a toolbar holds it. */
export const Outline: Story = {
  args: { variant: 'outline', size: 'sm' },
}

/** Ghost, as the sidebar holds it. */
export const Ghost: Story = {
  args: { variant: 'ghost', size: 'sm' },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
