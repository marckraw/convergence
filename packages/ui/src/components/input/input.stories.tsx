import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Input } from './input'

const meta = {
  title: 'Primitives/Input',
  component: Input,
  args: {
    id: 'project-name',
    placeholder: 'convergence',
    size: 'lg',
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
    const field = canvas.getByLabelText('Project name')
    await userEvent.click(field)
    await expect(field).toHaveFocus()
    await userEvent.keyboard('emergence')
    await expect(field).toHaveValue('emergence')
    await expect(args.onChange).toHaveBeenCalled()
    // The keyboard's ring really draws, over the border.
    await userEvent.tab()
    await userEvent.tab({ shift: true })
    await expect(field).toHaveFocus()
    await expect(getComputedStyle(field).outlineStyle).toBe('solid')
  },
}

/** Sizes (R3): 24, 28, 32 and 36 px, as a prop. */
export const Sizes: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
        <Input
          key={size}
          size={size}
          aria-label={`Size ${size}`}
          defaultValue={size}
        />
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const heights = { xs: 24, sm: 28, md: 32, lg: 36 }
    for (const [size, height] of Object.entries(heights)) {
      const field = canvas.getByLabelText(`Size ${size}`)
      await expect(field).toHaveAttribute('data-size', size)
      await expect(field.getBoundingClientRect().height).toBe(height)
    }
  },
}

/** Invalid: the border turns the danger colour, and the field says it's invalid. */
export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'feature/one two' },
  play: async ({ canvas }) => {
    const field = canvas.getByLabelText('Project name')
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(getComputedStyle(field).borderTopColor).toBe(
      tokenColor('--danger-solid'),
    )
  },
}

/** Long: a value wider than the field scrolls inside it. */
export const Long: Story = {
  args: {
    defaultValue:
      '/Users/marckraw/Projects/Private/convergence/.claude/worktrees/agent-abdaa619e1e6cfc7d',
  },
  play: async ({ canvas }) => {
    const field = canvas.getByLabelText('Project name')
    await expect(field.scrollWidth).toBeGreaterThan(field.clientWidth)
    await expect(field.getBoundingClientRect().width).toBe(320)
  },
}

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'convergence' },
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByLabelText('Project name')
    await expect(field).toBeDisabled()
    await userEvent.tab()
    await expect(field).not.toHaveFocus()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
