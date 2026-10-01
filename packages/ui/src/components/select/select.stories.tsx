import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { settled } from '../../../.storybook/motion-testing'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select'

type ModelSelectProps = {
  onValueChange: (value: string) => void
  disabled?: boolean
  /** The models listed, by label. */
  models: string[]
}

/** Choosing a model, as the composer's model picker does. */
function ModelSelect({ onValueChange, disabled, models }: ModelSelectProps) {
  return (
    <Select
      defaultValue={models[0]}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectTrigger aria-label="Model" className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Claude Code</SelectLabel>
          {models.map((model) => (
            <SelectItem key={model} value={model}>
              {model}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Codex</SelectLabel>
          <SelectItem value="gpt">GPT-6.1 Sol</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

const meta = {
  title: 'Primitives/Select',
  component: ModelSelect,
  args: {
    onValueChange: fn(),
    models: ['Claude Opus 5.5', 'Claude Sonnet 5.5'],
  },
} satisfies Meta<typeof ModelSelect>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Model' })
    await expect(trigger).toHaveTextContent('Claude Opus 5.5')
    await userEvent.click(trigger)
    const listbox = await screen.findByRole('listbox')
    await settled(listbox)
    await userEvent.click(screen.getByRole('option', { name: 'GPT-6.1 Sol' }))
    await expect(args.onValueChange).toHaveBeenCalledWith('gpt')
    await waitFor(() => expect(trigger).toHaveTextContent('GPT-6.1 Sol'))
    // The keyboard opens it too, and focus comes back to the trigger.
    await expect(trigger).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

/** Long: a long list scrolls inside the window. */
export const Long: Story = {
  args: {
    models: Array.from(
      { length: 40 },
      (_, index) => `Claude model ${index + 1}`,
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Model' }))
    const listbox = await screen.findByRole('listbox')
    await settled(listbox)
    const box = listbox.getBoundingClientRect()
    await expect(box.top).toBeGreaterThanOrEqual(0)
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
    await userEvent.keyboard('{Escape}')
  },
}

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Model' })
    await expect(trigger).toBeDisabled()
    await userEvent.tab()
    await expect(trigger).not.toHaveFocus()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
