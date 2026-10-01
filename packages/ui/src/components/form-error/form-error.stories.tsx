import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { FormError } from './form-error'

const meta = {
  title: 'Components/FormError',
  component: FormError,
  args: {
    children: "Couldn't save the project.",
    detail: 'The folder moved or was deleted. Pick it again and save.',
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormError>

export default meta

type Story = StoryObj<typeof meta>

/** R10: what failed, then why, announced at once. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const alert = canvas.getByRole('alert')
    await expect(alert).toHaveTextContent("Couldn't save the project.")
    await expect(alert).toHaveTextContent('The folder moved or was deleted.')
  },
}

/** Long: a long reason wraps, even a path with no spaces. */
export const Long: Story = {
  args: {
    children: "Couldn't create the workspace.",
    detail:
      'git worktree add failed for /Users/marckraw/Projects/Private/convergence/.claude/worktrees/agent-abdaa619e1e6cfc7d: the branch is already checked out in another worktree.',
  },
  play: async ({ canvas }) => {
    const alert = canvas.getByRole('alert')
    await expect(alert.scrollWidth).toBeLessThanOrEqual(alert.clientWidth)
  },
}

/** Empty: no error, nothing rendered. */
export const Empty: Story = {
  args: { children: undefined, detail: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('alert')).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
