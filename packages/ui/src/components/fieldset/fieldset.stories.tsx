import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ChoiceField } from '../choice-field/choice-field'
import { RadioGroup, RadioGroupItem } from '../radio-group/radio-group'
import { Fieldset, FieldsetDescription, FieldsetLegend } from './fieldset'

type StrategyProps = {
  disabled?: boolean
  /** A hint for the whole group, under its legend. */
  hint?: string
  onValueChange: (value: string) => void
}

/** A workspace's strategy: a legend over a group of radios, each with its words. */
function Strategy({ disabled, hint, onValueChange }: StrategyProps) {
  return (
    <Fieldset
      className="w-80"
      disabled={disabled}
      render={
        <RadioGroup
          defaultValue="worktree"
          onValueChange={(value: string) => onValueChange(value)}
        />
      }
    >
      <FieldsetLegend>Strategy</FieldsetLegend>
      {hint ? <FieldsetDescription>{hint}</FieldsetDescription> : null}
      <ChoiceField
        label="Worktree"
        hint="A new git worktree beside the project."
      >
        <RadioGroupItem value="worktree" />
      </ChoiceField>
      <ChoiceField
        label="Copy"
        hint="A full copy of the folder, ignored files included."
      >
        <RadioGroupItem value="copy" />
      </ChoiceField>
    </Fieldset>
  )
}

const meta = {
  title: 'Components/Fieldset',
  component: Strategy,
  args: { onValueChange: fn() },
} satisfies Meta<typeof Strategy>

export default meta

type Story = StoryObj<typeof meta>

/** The legend names the group, so a screen reader says it before each choice. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('radiogroup', { name: 'Strategy' }),
    ).toBeVisible()
    const copy = canvas.getByRole('radio', { name: 'Copy' })
    await userEvent.click(copy)
    await expect(copy).toBeChecked()
    await expect(args.onValueChange).toHaveBeenCalledWith('copy')
  },
}

/**
 * Described: a hint for the whole group describes it, so a screen reader
 * says it with the group's name (DLG-7).
 */
export const Described: Story = {
  args: { hint: 'This only affects new workspaces.' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('radiogroup', {
        name: 'Strategy',
        description: 'This only affects new workspaces.',
      }),
    ).toBeVisible()
  },
}

/** Disabled: everything inside is disabled with it. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas, userEvent }) => {
    for (const radio of canvas.getAllByRole('radio')) {
      await expect(radio).toHaveAttribute('aria-disabled', 'true')
    }
    await userEvent.click(canvas.getByText('Copy'))
    await expect(canvas.getByRole('radio', { name: 'Copy' })).not.toBeChecked()
    await expect(args.onValueChange).not.toHaveBeenCalled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
