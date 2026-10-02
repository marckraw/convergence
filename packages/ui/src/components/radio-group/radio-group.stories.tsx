import type { Meta, StoryObj } from '@storybook/react-vite'
import { Ban } from 'lucide-react'
import { expect, fn, screen } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { ChoiceField } from '../choice-field/choice-field'
import { RadioGroup, RadioGroupItem, RadioSwatch } from './radio-group'

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

const swatchPicked = fn()

/** A crew's colour: one of a row of swatches, or none. */
function CrewColour() {
  return (
    <RadioGroup
      aria-label="Crew accent color"
      defaultValue="violet"
      onValueChange={(value: string) => swatchPicked(value)}
      className="flex-row flex-wrap items-center gap-1 rounded-md bg-canvas p-3"
    >
      <RadioSwatch value="none" label="No accent color">
        <Ban />
      </RadioSwatch>
      {(['violet', 'blue', 'green', 'amber'] as const).map((hue) => (
        <RadioSwatch
          key={hue}
          value={hue}
          label={hue[0]!.toUpperCase() + hue.slice(1)}
        >
          <span
            className="size-3 rounded-sm"
            style={{ backgroundColor: `var(--crew-${hue})` }}
          />
        </RadioSwatch>
      ))}
    </RadioGroup>
  )
}

/**
 * Swatches: a one-of-many choice drawn as pictures (MC-19). Each is a radio
 * named by its label, which is its tooltip too; the chosen one is the raised
 * chip (R7); the arrows move the choice and "none" is a choice of its own.
 */
export const Swatches: Story = {
  render: () => <CrewColour />,
  play: async ({ canvas, userEvent }) => {
    const group = canvas.getByRole('radiogroup', { name: 'Crew accent color' })
    await expect(group).toBeVisible()
    const violet = canvas.getByRole('radio', { name: 'Violet' })
    await expect(violet).toBeChecked()
    await expect(violet.getBoundingClientRect().height).toBe(24)
    await expect(getComputedStyle(violet).boxShadow).not.toBe('none')
    await expect(getComputedStyle(violet).backgroundColor).toBe(
      tokenColor('--chip'),
    )
    const blue = canvas.getByRole('radio', { name: 'Blue' })
    await expect(getComputedStyle(blue).boxShadow).toBe('none')
    // A swatch shows no words: its label is its tooltip (R2).
    await userEvent.hover(blue)
    await expect(
      await screen.findByRole('tooltip', {}, { timeout: 2000 }),
    ).toHaveTextContent('Blue')
    await userEvent.click(blue)
    await expect(blue).toBeChecked()
    await expect(violet).not.toBeChecked()
    await expect(swatchPicked).toHaveBeenLastCalledWith('blue')
    // Picking the chosen one again keeps it: clearing is "none", a choice.
    await userEvent.click(blue)
    await expect(blue).toBeChecked()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    const none = canvas.getByRole('radio', { name: 'No accent color' })
    await expect(none).toBeChecked()
    await expect(none).toHaveFocus()
    await expect(swatchPicked).toHaveBeenLastCalledWith('none')
  },
}

export const SwatchesDark: Story = {
  ...Swatches,
  globals: { theme: 'dark' },
}
