import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
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
    const field = canvas.getByLabelText('Instructions')
    await userEvent.click(field)
    await expect(field).toHaveFocus()
    await userEvent.keyboard('Summarise the diff.{Enter}Then open a PR.')
    await expect(field).toHaveValue('Summarise the diff.\nThen open a PR.')
    await expect(args.onChange).toHaveBeenCalled()
    // Its edge is the control line (MAR-3460), as Input's is.
    await expect(getComputedStyle(field).borderTopColor).toBe(
      tokenColor('--control-line'),
    )
  },
}

/** Compact (ruling 10): 12 px words, for a dense panel. Never a text size in className. */
export const Compact: Story = {
  args: {
    density: 'compact',
    defaultValue: 'Review the diff, then hand it on.',
  },
  play: async ({ canvas }) => {
    const field = canvas.getByLabelText('Instructions')
    await expect(field).toHaveAttribute('data-density', 'compact')
    await expect(getComputedStyle(field).fontSize).toBe('12px')
  },
}

/** AutoGrow: it grows a line at a time as you type, up to maxRows, then scrolls. */
export const AutoGrow: Story = {
  args: { rows: 1, autoGrow: true, maxRows: 4, placeholder: 'Ask anything' },
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByLabelText('Instructions')
    const oneLine = field.getBoundingClientRect().height
    await userEvent.click(field)
    await userEvent.keyboard('one{Enter}two')
    const twoLines = field.getBoundingClientRect().height
    await expect(twoLines).toBeGreaterThan(oneLine)
    await userEvent.keyboard('{Enter}three{Enter}four{Enter}five{Enter}six')
    const capped = field.getBoundingClientRect().height
    await expect(field.scrollHeight).toBeGreaterThan(field.clientHeight)
    await userEvent.keyboard('{Enter}seven')
    await expect(field.getBoundingClientRect().height).toBe(capped)
  },
}

/** Invalid: the border turns the danger colour, and the field says it's invalid. */
export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'Do the thing.' },
  play: async ({ canvas }) => {
    const field = canvas.getByLabelText('Instructions')
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(getComputedStyle(field).borderTopColor).toBe(
      tokenColor('--danger-solid'),
    )
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
    const field = canvas.getByLabelText('Instructions')
    await expect(field.scrollHeight).toBeGreaterThan(field.clientHeight)
  },
}

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Waiting for the agent to finish.' },
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByLabelText('Instructions')
    await expect(field).toBeDisabled()
    await userEvent.tab()
    await expect(field).not.toHaveFocus()
  },
}

/**
 * Bare: the text inside a card that is the field, like the composer's. No
 * edge, padding, handle or ring of its own; the caret says where you are.
 */
export const Bare: Story = {
  render: () => (
    <div className="w-96 rounded-xl border border-line bg-surface p-3">
      <Textarea
        variant="bare"
        rows={1}
        autoGrow
        maxRows={8}
        aria-label="Message"
        placeholder="Ask anything"
        className="text-ink"
      />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByLabelText('Message')
    await expect(field).toHaveAttribute('data-variant', 'bare')
    await userEvent.click(field)
    await userEvent.keyboard('Summarise the diff.')
    await expect(field).toHaveValue('Summarise the diff.')
    await expect(getComputedStyle(field).borderTopWidth).toBe('0px')
    await expect(getComputedStyle(field).outlineStyle).toBe('none')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
