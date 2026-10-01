import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { Input } from './input'

const meta = {
  title: 'Primitives/Input',
  component: Input,
  args: {
    id: 'project-name',
    placeholder: 'convergence',
    onChange: fn(),
  },
  render: (args) => (
    <div className="flex w-80 flex-col gap-1.5">
      <label htmlFor={args.id} className="text-sm font-medium">
        Project name
      </label>
      <Input {...args} />
    </div>
  ),
} satisfies Meta<typeof Input>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const field = canvas.getByRole('textbox', { name: 'Project name' })
    await userEvent.click(field)
    await expect(field).toHaveFocus()
    await userEvent.keyboard('emergence')
    await expect(field).toHaveValue('emergence')
    await expect(args.onChange).toHaveBeenCalled()
  },
}

/** Long: a value wider than the field scrolls inside it. */
export const Long: Story = {
  args: {
    defaultValue:
      '/Users/marckraw/Projects/Private/convergence/.claude/worktrees/agent-abdaa619e1e6cfc7d',
  },
  play: async ({ canvas }) => {
    const field = canvas.getByRole('textbox', { name: 'Project name' })
    await expect(field.scrollWidth).toBeGreaterThan(field.clientWidth)
    await expect(field.getBoundingClientRect().width).toBe(320)
  },
}

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'convergence' },
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByRole('textbox', { name: 'Project name' })
    await expect(field).toBeDisabled()
    await userEvent.tab()
    await expect(field).not.toHaveFocus()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
