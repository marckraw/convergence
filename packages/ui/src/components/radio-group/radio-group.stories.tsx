import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ChoiceField } from '../choice-field/choice-field'
import { RadioGroup, RadioGroupItem } from './radio-group'

type ReinjectProps = {
  disabled?: boolean
  onValueChange: (value: string) => void
}

/** When a project's context goes to the agent: once, or every turn. */
function Reinject({ disabled, onValueChange }: ReinjectProps) {
  return (
    <div className="flex w-80 flex-col gap-2">
      <RadioGroup
        aria-label="Send the context"
        defaultValue="boot"
        disabled={disabled}
        onValueChange={(value: string) => onValueChange(value)}
      >
        <ChoiceField label="At session start">
          <RadioGroupItem value="boot" />
        </ChoiceField>
        <ChoiceField label="Every turn">
          <RadioGroupItem value="every-turn" />
        </ChoiceField>
      </RadioGroup>
      <button type="button" className="w-fit text-sm underline">
        After the group
      </button>
    </div>
  )
}

const meta = {
  title: 'Primitives/RadioGroup',
  component: Reinject,
  args: { onValueChange: fn() },
} satisfies Meta<typeof Reinject>

export default meta

type Story = StoryObj<typeof meta>

/** Tab reaches the chosen one, the arrow keys move the choice, Tab leaves the group. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const boot = canvas.getByRole('radio', { name: 'At session start' })
    const every = canvas.getByRole('radio', { name: 'Every turn' })
    await expect(boot).toBeChecked()
    await userEvent.tab()
    await expect(boot).toHaveFocus()
    await expect(getComputedStyle(boot).outlineStyle).toBe('solid')
    await userEvent.keyboard('{ArrowDown}')
    await expect(every).toBeChecked()
    await expect(every).toHaveFocus()
    await expect(args.onValueChange).toHaveBeenLastCalledWith('every-turn')
    await userEvent.tab()
    await expect(
      canvas.getByRole('button', { name: 'After the group' }),
    ).toHaveFocus()
  },
}

/** Disabled: the choice shows and can't be moved. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas, userEvent }) => {
    const every = canvas.getByRole('radio', { name: 'Every turn' })
    await expect(every).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(canvas.getByText('Every turn'))
    await expect(every).not.toBeChecked()
    await expect(args.onValueChange).not.toHaveBeenCalled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
