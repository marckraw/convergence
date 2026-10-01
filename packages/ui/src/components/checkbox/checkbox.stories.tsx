import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Checkbox } from './checkbox'

const meta = {
  title: 'Primitives/Checkbox',
  component: Checkbox,
  args: { onCheckedChange: fn() },
  render: (args) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox {...args} />
      Merge when reviewed
    </label>
  ),
} satisfies Meta<typeof Checkbox>

export default meta

type Story = StoryObj<typeof meta>

/** A click, its words and Space all toggle it; the keyboard's ring really draws. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const box = canvas.getByRole('checkbox', { name: 'Merge when reviewed' })
    await expect(box).not.toBeChecked()
    await userEvent.click(box)
    await expect(box).toBeChecked()
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(
      true,
      expect.anything(),
    )
    await userEvent.click(canvas.getByText('Merge when reviewed'))
    await expect(box).not.toBeChecked()
    await userEvent.tab()
    await userEvent.tab({ shift: true })
    await expect(box).toHaveFocus()
    await expect(getComputedStyle(box).outlineStyle).toBe('solid')
    await userEvent.keyboard(' ')
    await expect(box).toBeChecked()
    const rect = box.getBoundingClientRect()
    await expect(rect.width).toBe(16)
    await expect(rect.height).toBe(16)
  },
}

/** Indeterminate: some of a group on, says "mixed". */
export const Indeterminate: Story = {
  args: { indeterminate: true },
  play: async ({ canvas }) => {
    const box = canvas.getByRole('checkbox', { name: 'Merge when reviewed' })
    await expect(box).toHaveAttribute('aria-checked', 'mixed')
  },
}

/** Invalid: the box's edge turns the danger colour. */
export const Invalid: Story = {
  args: { 'aria-invalid': true },
  play: async ({ canvas }) => {
    const box = canvas.getByRole('checkbox', { name: 'Merge when reviewed' })
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    await expect(getComputedStyle(box).borderTopColor).toBe(
      tokenColor('--danger-solid'),
    )
  },
}

/** Disabled: shows how it's set and can't be changed. */
export const Disabled: Story = {
  args: { disabled: true, defaultChecked: true },
  play: async ({ args, canvas, userEvent }) => {
    const box = canvas.getByRole('checkbox', { name: 'Merge when reviewed' })
    await expect(box).toHaveAttribute('aria-disabled', 'true')
    await expect(box).toBeChecked()
    await userEvent.click(canvas.getByText('Merge when reviewed'))
    await expect(box).toBeChecked()
    await expect(args.onCheckedChange).not.toHaveBeenCalled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
