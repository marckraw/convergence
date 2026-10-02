import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { SkillListStatus } from './skill-list-status.presentational'

const meta = {
  title: 'Entities/Skill/Skill list status',
  component: SkillListStatus,
  args: { state: { kind: 'empty' } },
  render: (args) => (
    <div className="w-80">
      <SkillListStatus {...args} />
    </div>
  ),
} satisfies Meta<typeof SkillListStatus>

export default meta

type Story = StoryObj<typeof meta>

/** The agent has no skills. */
export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('No skills available for this agent'),
    ).toBeVisible()
  },
}

/** A search that matches none of them. */
export const NoMatch: Story = {
  args: { state: { kind: 'no-match' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No matching skills')).toBeVisible()
  },
}

/** Reading the catalog: nothing for 300 ms, then a spinner and the words. */
export const Busy: Story = {
  args: { state: { kind: 'loading' } },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent('Loading skills…'),
    )
  },
}

/** The scan failed: an alert, what failed and why. Never "no skills". */
export const Failed: Story = {
  args: {
    state: {
      kind: 'failed',
      message: 'claude: skills listing timed out after 10s',
    },
  },
  play: async ({ canvas }) => {
    const alert = canvas.getByRole('alert')
    await expect(alert).toHaveTextContent('Couldn’t load skills')
    await expect(alert).toHaveTextContent('timed out after 10s')
  },
}

/** A list with rows draws them; the status draws nothing. */
export const Listed: Story = {
  args: { state: { kind: 'listed' } },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-slot="empty-state"]'),
    ).toBeNull()
  },
}

export const Dark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}
