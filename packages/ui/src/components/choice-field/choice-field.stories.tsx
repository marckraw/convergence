import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn } from 'storybook/test'
import { Checkbox } from '../checkbox/checkbox'
import { Fieldset, FieldsetLegend } from '../fieldset/fieldset'
import { RadioGroup, RadioGroupItem } from '../radio-group/radio-group'
import { Switch } from '../switch/switch'
import { ChoiceField } from './choice-field'

type Words = { label: string; hint?: string }

type ChoicesProps = {
  /** The switch: a setting that takes effect at once. */
  updates: Words
  /** The checkbox: one of several that can all be on. */
  merge: Words
  /** The radios: one of a few. */
  starts: (Words & { value: string })[]
  disabled?: boolean
  onUpdatesChange: (on: boolean) => void
  onMergeChange: (on: boolean) => void
  onStartChange: (value: string) => void
}

/** All three kinds, as settings have them: a switch, a checkbox, a radio group. */
function Choices({
  updates,
  merge,
  starts,
  disabled,
  onUpdatesChange,
  onMergeChange,
  onStartChange,
}: ChoicesProps) {
  const [updatesOn, setUpdatesOn] = useState(true)
  const [mergeOn, setMergeOn] = useState(false)
  const [start, setStart] = useState(starts[0]?.value ?? '')
  return (
    <div className="flex w-96 max-w-full flex-col gap-3">
      <ChoiceField
        label={updates.label}
        hint={updates.hint}
        disabled={disabled}
      >
        <Switch
          checked={updatesOn}
          onCheckedChange={(checked) => {
            setUpdatesOn(checked)
            onUpdatesChange(checked)
          }}
        />
      </ChoiceField>
      <ChoiceField label={merge.label} hint={merge.hint} disabled={disabled}>
        <Checkbox
          checked={mergeOn}
          onCheckedChange={(checked) => {
            setMergeOn(checked)
            onMergeChange(checked)
          }}
        />
      </ChoiceField>
      <Fieldset
        disabled={disabled}
        render={
          <RadioGroup
            value={start}
            onValueChange={(value: string) => {
              setStart(value)
              onStartChange(value)
            }}
          />
        }
      >
        <FieldsetLegend>Start from</FieldsetLegend>
        {starts.map((choice) => (
          <ChoiceField
            key={choice.value}
            label={choice.label}
            hint={choice.hint}
          >
            <RadioGroupItem value={choice.value} />
          </ChoiceField>
        ))}
      </Fieldset>
    </div>
  )
}

const meta = {
  title: 'Components/ChoiceField',
  component: Choices,
  args: {
    updates: {
      label: 'Check for updates automatically',
      hint: 'Check GitHub every few hours while the app is running.',
    },
    merge: {
      label: 'Merge when reviewed',
      hint: 'Squash, then delete the branch.',
    },
    starts: [
      { value: 'branch', label: 'The current branch' },
      { value: 'master', label: 'master', hint: 'Fetched first.' },
    ],
    onUpdatesChange: fn(),
    onMergeChange: fn(),
    onStartChange: fn(),
  },
} satisfies Meta<typeof Choices>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The words name each control and the hint describes it. Pressing the words
 * toggles it. A switch sits at the row's end; a checkbox or a radio before
 * its words.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const updates = canvas.getByRole('switch', {
      name: 'Check for updates automatically',
    })
    await expect(updates).toHaveAccessibleDescription(
      'Check GitHub every few hours while the app is running.',
    )
    await userEvent.click(canvas.getByText('Check for updates automatically'))
    await expect(updates).not.toBeChecked()
    await expect(args.onUpdatesChange).toHaveBeenCalledWith(false)
    const words = canvas
      .getByText('Check for updates automatically')
      .getBoundingClientRect()
    await expect(updates.getBoundingClientRect().left).toBeGreaterThan(
      words.right,
    )

    const merge = canvas.getByRole('checkbox', { name: 'Merge when reviewed' })
    await expect(merge).toHaveAccessibleDescription(
      'Squash, then delete the branch.',
    )
    await userEvent.click(canvas.getByText('Merge when reviewed'))
    await expect(merge).toBeChecked()
    await expect(args.onMergeChange).toHaveBeenCalledWith(true)
    await expect(merge.getBoundingClientRect().right).toBeLessThan(
      canvas.getByText('Merge when reviewed').getBoundingClientRect().left,
    )

    await expect(
      canvas.getByRole('radiogroup', { name: 'Start from' }),
    ).toBeVisible()
    const master = canvas.getByRole('radio', { name: 'master' })
    await expect(master).toHaveAccessibleDescription('Fetched first.')
    await userEvent.click(canvas.getByText('master'))
    await expect(master).toBeChecked()
    await expect(args.onStartChange).toHaveBeenCalledWith('master')
  },
}

/** Disabled: each shows how it's set and can't be changed; its words dim with it. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas, userEvent }) => {
    const updates = canvas.getByRole('switch', {
      name: 'Check for updates automatically',
    })
    await expect(updates).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(canvas.getByText('Check for updates automatically'))
    await expect(updates).toBeChecked()
    await expect(args.onUpdatesChange).not.toHaveBeenCalled()
    await expect(
      canvas.getByRole('checkbox', { name: 'Merge when reviewed' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await expect(canvas.getByRole('radio', { name: 'master' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  },
}

/** Long: long words wrap beside the control, which keeps its size and place. */
export const Long: Story = {
  args: {
    updates: {
      label:
        'Notify me when an agent finishes, fails, asks for approval or needs an answer before it can go on',
      hint: 'A system notification, even when Convergence is in the background, with the conversation’s name and the provider that ran it.',
    },
  },
  play: async ({ args, canvas }) => {
    const updates = canvas.getByRole('switch', { name: args.updates.label })
    const box = updates.getBoundingClientRect()
    await expect(box.width).toBe(36)
    await expect(box.height).toBe(20)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
