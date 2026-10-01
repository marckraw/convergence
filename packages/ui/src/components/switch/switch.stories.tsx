import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { expect, fn } from 'storybook/test'
import { SwitchRow } from './switch'

/** SwitchRow is controlled; this keeps its state the way a settings form does. */
function ControlledSwitchRow(props: ComponentProps<typeof SwitchRow>) {
  const [checked, setChecked] = useState(props.checked)
  return (
    <div className="w-96">
      <SwitchRow
        {...props}
        checked={checked}
        onChange={(next) => {
          setChecked(next)
          props.onChange(next)
        }}
      />
    </div>
  )
}

const meta = {
  title: 'Primitives/SwitchRow',
  component: SwitchRow,
  args: {
    id: 'notify-when-done',
    label: 'Notify me when an agent finishes',
    description:
      'A system notification, even when Convergence is in the background.',
    checked: false,
    onChange: fn(),
  },
  render: (args) => <ControlledSwitchRow {...args} />,
} satisfies Meta<typeof SwitchRow>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('switch', { name: args.label })
    await expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    await expect(toggle).toBeChecked()
    await expect(args.onChange).toHaveBeenLastCalledWith(true)
    // Its label turns it too, and so does the keyboard.
    await userEvent.click(canvas.getByText(args.label))
    await expect(toggle).not.toBeChecked()
    await expect(toggle).toHaveFocus()
    await userEvent.keyboard(' ')
    await expect(toggle).toBeChecked()
  },
}

/** Long: a long label and description wrap beside the switch, which keeps its size. */
export const Long: Story = {
  args: {
    label:
      'Notify me when an agent finishes, fails, asks for approval or needs an answer before it can go on',
    description:
      'A system notification, even when Convergence is in the background, with the conversation’s name and the provider that ran it, so you can tell at a glance which one wants you.',
  },
  play: async ({ args, canvas }) => {
    const toggle = canvas.getByRole('switch', { name: args.label })
    const box = toggle.getBoundingClientRect()
    await expect(box.width).toBe(36)
    await expect(box.height).toBe(20)
  },
}

export const Disabled: Story = {
  args: { disabled: true, checked: true },
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('switch', { name: args.label })
    await expect(toggle).toBeDisabled()
    await expect(toggle).toBeChecked()
    await userEvent.tab()
    await expect(toggle).not.toHaveFocus()
    await expect(args.onChange).not.toHaveBeenCalled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
