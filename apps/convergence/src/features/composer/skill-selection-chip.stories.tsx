import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SkillSelectionChip } from './skill-selection-chip.presentational'

const meta = {
  title: 'Features/Composer/SkillSelectionChip',
  component: SkillSelectionChip,
  args: {
    selection: {
      id: 'skill-diagnose',
      providerId: 'claude-code',
      name: 'diagnose',
      path: '/Users/me/.claude/skills/diagnose/SKILL.md',
      scope: 'user',
      rawScope: 'user',
      providerName: 'Claude Code',
      displayName: 'diagnose',
      sourceLabel: 'User',
      status: 'selected',
    },
    onRemove: fn(),
  },
} satisfies Meta<typeof SkillSelectionChip>

export default meta

type Story = StoryObj<typeof meta>

/** A skill chosen for the next message; its × takes it off again. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('selected')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove diagnose' }),
    )
    await expect(args.onRemove).toHaveBeenCalledWith('skill-diagnose')
  },
}

/** A long skill name is cut short inside its chip. */
export const Long: Story = {
  args: {
    selection: {
      id: 'skill-long',
      providerId: 'claude-code',
      name: 'update-convergence-provider-models',
      path: null,
      scope: 'project',
      rawScope: 'project',
      providerName: 'Claude Code',
      displayName:
        'update-convergence-provider-models-from-the-upstream-catalogs',
      sourceLabel: 'Project',
      status: 'unavailable',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-56">
        <Story />
      </div>
    ),
  ],
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
