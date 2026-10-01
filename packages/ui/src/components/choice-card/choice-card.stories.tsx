import type { Meta, StoryObj } from '@storybook/react-vite'
import { GitBranch, GitFork, Layers } from 'lucide-react'
import type { ReactNode } from 'react'
import { expect, fn } from 'storybook/test'
import { RadioGroup } from '../radio-group/radio-group'
import { ChoiceCard } from './choice-card'

type Option = {
  value: string
  title: string
  description: string
  icon?: ReactNode
  disabled?: boolean
}

type ForkStrategyProps = {
  options: Option[]
  onValueChange: (value: string) => void
}

/** How to fork a conversation: options that each need a sentence (R9). */
function ForkStrategy({ options, onValueChange }: ForkStrategyProps) {
  return (
    <RadioGroup
      aria-label="Fork strategy"
      defaultValue={options[0]?.value}
      onValueChange={(value: string) => onValueChange(value)}
      className="w-96 max-w-full gap-2"
    >
      {options.map((option) => (
        <ChoiceCard
          key={option.value}
          value={option.value}
          title={option.title}
          description={option.description}
          icon={option.icon}
          disabled={option.disabled}
        />
      ))}
    </RadioGroup>
  )
}

const options: Option[] = [
  {
    value: 'full',
    title: 'Full history',
    description: 'The new conversation starts with every turn of this one.',
    icon: <Layers />,
  },
  {
    value: 'summary',
    title: 'Summary',
    description:
      'The selected model writes a summary, and the fork starts from it.',
    icon: <GitFork />,
  },
  {
    value: 'branch',
    title: 'From a turn',
    description: 'Pick the turn to branch from; later turns stay here.',
    icon: <GitBranch />,
  },
]

const meta = {
  title: 'Components/ChoiceCard',
  component: ForkStrategy,
  args: { options, onValueChange: fn() },
} satisfies Meta<typeof ForkStrategy>

export default meta

type Story = StoryObj<typeof meta>

/** One card is chosen, raised with a stronger edge; a click or the arrows move the choice. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const full = canvas.getByRole('radio', { name: 'Full history' })
    const summary = canvas.getByRole('radio', { name: 'Summary' })
    await expect(full).toHaveAttribute('aria-checked', 'true')
    await expect(summary).toHaveAttribute('aria-checked', 'false')
    await expect(summary).toHaveAccessibleDescription(
      'The selected model writes a summary, and the fork starts from it.',
    )
    await expect(getComputedStyle(full).boxShadow).not.toBe('none')
    await expect(getComputedStyle(summary).boxShadow).toBe('none')

    await userEvent.click(summary)
    await expect(summary).toBeChecked()
    await expect(full).not.toBeChecked()
    await expect(args.onValueChange).toHaveBeenLastCalledWith('summary')
    await expect(
      canvas
        .getAllByRole('radio')
        .filter((radio) => radio.ariaChecked === 'true'),
    ).toHaveLength(1)

    await userEvent.keyboard('{ArrowDown}')
    await expect(
      canvas.getByRole('radio', { name: 'From a turn' }),
    ).toBeChecked()
    await expect(
      getComputedStyle(document.activeElement as Element).outlineStyle,
    ).toBe('solid')
  },
}

/** Disabled: one card can't be chosen. */
export const Disabled: Story = {
  args: {
    options: options.map((option) =>
      option.value === 'summary' ? { ...option, disabled: true } : option,
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    const summary = canvas.getByRole('radio', { name: 'Summary' })
    await expect(summary).toHaveAttribute('aria-disabled', 'true')
    // The arrows skip it.
    await userEvent.click(canvas.getByRole('radio', { name: 'Full history' }))
    await userEvent.keyboard('{ArrowDown}')
    await expect(summary).not.toBeChecked()
    await expect(
      canvas.getByRole('radio', { name: 'From a turn' }),
    ).toBeChecked()
    await expect(args.onValueChange).not.toHaveBeenCalledWith('summary')
  },
}

/** Long: long words wrap inside the card; the cards keep one width. */
export const Long: Story = {
  args: {
    options: [
      {
        value: 'full',
        title: 'Full history, with every tool call, attachment and annotation',
        description:
          'The new conversation starts with every turn of this one, in order, including the turns that failed and the ones you annotated, so the agent sees exactly what you saw.',
      },
      ...options.slice(1),
    ],
  },
  play: async ({ canvas }) => {
    const [first, second] = canvas.getAllByRole('radio')
    await expect(first?.getBoundingClientRect().width).toBe(
      second?.getBoundingClientRect().width,
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
