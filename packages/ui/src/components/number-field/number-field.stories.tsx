import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, waitFor } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Field, FieldDescription, FieldError, FieldLabel } from '../field/field'
import { NumberField } from './number-field'

type WipLimitProps = {
  onValueChange: (value: number | null) => void
  disabled?: boolean
  stepsDisabled?: boolean
  invalid?: boolean
  /** Where it starts. */
  start: number | null
}

/** A seat's WIP limit, as Mission Control's seat editor asks for it. */
function WipLimit({
  onValueChange,
  disabled,
  stepsDisabled,
  invalid,
  start,
}: WipLimitProps) {
  const [value, setValue] = useState<number | null>(start)
  return (
    <Field invalid={invalid} disabled={disabled} className="w-64">
      <FieldLabel>WIP limit</FieldLabel>
      <NumberField
        min={1}
        value={value}
        stepsDisabled={stepsDisabled}
        decrementLabel="Lower the WIP limit"
        incrementLabel="Raise the WIP limit"
        onValueChange={(next) => {
          setValue(next)
          onValueChange(next)
        }}
      />
      <FieldDescription>Issues this seat may hold at once.</FieldDescription>
      {invalid ? (
        <FieldError match>
          WIP limit must be a whole number of at least 1.
        </FieldError>
      ) : null}
    </Field>
  )
}

const meta = {
  title: 'Primitives/NumberField',
  component: WipLimit,
  args: { onValueChange: fn(), start: 2 },
} satisfies Meta<typeof WipLimit>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The Field's label names it and its description describes it. Typing sets
 * the number, the arrows step it, and so do − and +, named by what they
 * change; at the minimum, − is unavailable. While the field has the focus
 * the ring goes round the whole box.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const field = canvas.getByRole('textbox', { name: 'WIP limit' })
    await expect(field).toHaveAccessibleDescription(
      'Issues this seat may hold at once.',
    )
    await expect(field).toHaveValue('2')
    const lower = canvas.getByRole('button', { name: 'Lower the WIP limit' })
    const raise = canvas.getByRole('button', { name: 'Raise the WIP limit' })

    await userEvent.click(raise)
    await expect(field).toHaveValue('3')
    await expect(args.onValueChange).toHaveBeenLastCalledWith(3)

    await userEvent.click(field)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await expect(field).toHaveValue('1')
    await waitFor(() => expect(lower).toHaveAttribute('data-disabled'))

    await userEvent.clear(field)
    await userEvent.type(field, '5')
    await expect(field).toHaveValue('5')
    await expect(args.onValueChange).toHaveBeenLastCalledWith(5)

    const box = field.closest<HTMLElement>('[data-slot="number-field-group"]')
    await expect(box).not.toBeNull()
    await expect(getComputedStyle(box as HTMLElement).outlineStyle).toBe(
      'solid',
    )
    // The ring's colour fades in with the frame's colours. (The token is
    // read outside waitFor: reading it adds a probe to the page, which would
    // wake waitFor again, for ever.)
    const focus = tokenColor('--focus')
    await waitFor(() =>
      expect(getComputedStyle(box as HTMLElement).outlineColor).toBe(focus),
    )
    await expect((box as HTMLElement).getBoundingClientRect().height).toBe(32)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Nothing typed yet: the field is empty, and a step starts it at the minimum. */
export const Empty: Story = {
  args: { start: null },
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByRole('textbox', { name: 'WIP limit' })
    await expect(field).toHaveValue('')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Raise the WIP limit' }),
    )
    await expect(field).toHaveValue('1')
  },
}

/** A step being saved: − and + wait, and the field still takes typing. */
export const Busy: Story = {
  args: { stepsDisabled: true },
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByRole('textbox', { name: 'WIP limit' })
    await expect(
      canvas.getByRole('button', { name: 'Raise the WIP limit' }),
    ).toHaveAttribute('data-disabled')
    await userEvent.clear(field)
    await userEvent.type(field, '4')
    await expect(field).toHaveValue('4')
  },
}

/** Disabled in its Field: the field and both steps are unavailable. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('textbox', { name: 'WIP limit' }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole('button', { name: 'Lower the WIP limit' }),
    ).toHaveAttribute('data-disabled')
  },
}

/** Refused: the Field's error describes the field, and the box turns the danger colour. */
export const Failed: Story = {
  args: { invalid: true },
  play: async ({ canvas }) => {
    const field = canvas.getByRole('textbox', { name: 'WIP limit' })
    await expect(field).toBeInvalid()
    await expect(field).toHaveAccessibleDescription(
      expect.stringContaining(
        'WIP limit must be a whole number of at least 1.',
      ),
    )
    const box = field.closest<HTMLElement>('[data-slot="number-field-group"]')
    const danger = tokenColor('--danger-solid')
    await waitFor(() =>
      expect(getComputedStyle(box as HTMLElement).borderTopColor).toBe(danger),
    )
  },
}

/** On its own, with an aria-label and an aria-invalid of its own: the border still says so. */
export const Standalone: Story = {
  render: () => (
    <NumberField
      aria-label="Runs at once"
      aria-invalid
      defaultValue={0}
      min={1}
      allowOutOfRange
    />
  ),
  play: async ({ canvas }) => {
    const field = canvas.getByRole('textbox', { name: 'Runs at once' })
    await expect(field).toBeInvalid()
    const box = field.closest<HTMLElement>('[data-slot="number-field-group"]')
    const danger = tokenColor('--danger-solid')
    await waitFor(() =>
      expect(getComputedStyle(box as HTMLElement).borderTopColor).toBe(danger),
    )
    await expect(
      canvas.getByRole('button', { name: 'Increase' }),
    ).toBeInTheDocument()
  },
}
