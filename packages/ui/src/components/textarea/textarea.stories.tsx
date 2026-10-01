import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { Textarea } from './textarea'

const meta = {
  title: 'Primitives/Textarea',
  component: Textarea,
  args: {
    id: 'instructions',
    placeholder: 'What should the agent do next?',
    rows: 4,
    onChange: fn(),
  },
  render: (args) => (
    <div className="flex w-96 flex-col gap-1.5">
      <label htmlFor={args.id} className="text-sm font-medium">
        Instructions
      </label>
      <Textarea {...args} />
    </div>
  ),
} satisfies Meta<typeof Textarea>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const field = canvas.getByRole('textbox', { name: 'Instructions' })
    await userEvent.click(field)
    await expect(field).toHaveFocus()
    await userEvent.keyboard('Summarise the diff.{Enter}Then open a PR.')
    await expect(field).toHaveValue('Summarise the diff.\nThen open a PR.')
    await expect(args.onChange).toHaveBeenCalled()
  },
}

/** Long: more lines than it shows scroll inside it. */
export const Long: Story = {
  args: {
    defaultValue: Array.from(
      { length: 20 },
      (_, line) => `Step ${line + 1}: read the file, change it, run the gates.`,
    ).join('\n'),
  },
  play: async ({ canvas }) => {
    const field = canvas.getByRole('textbox', { name: 'Instructions' })
    await expect(field.scrollHeight).toBeGreaterThan(field.clientHeight)
  },
}

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Waiting for the agent to finish.' },
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByRole('textbox', { name: 'Instructions' })
    await expect(field).toBeDisabled()
    await userEvent.tab()
    await expect(field).not.toHaveFocus()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
