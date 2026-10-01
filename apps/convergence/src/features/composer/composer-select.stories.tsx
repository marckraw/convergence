import type { Meta, StoryObj } from '@storybook/react-vite'
import { Zap } from 'lucide-react'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { ComposerSelect } from './composer-select.presentational'

const meta = {
  title: 'Features/Composer/ComposerSelect',
  component: ComposerSelect,
  args: {
    selectedId: 'medium',
    value: 'Medium',
    items: [
      { id: 'low', label: 'Low', description: 'Fastest, least thinking.' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High', description: 'Thinks longer.' },
    ],
    onChange: fn(),
    className: 'px-2 text-xs',
  },
} satisfies Meta<typeof ComposerSelect>

export default meta

type Story = StoryObj<typeof meta>

/** One of the composer's searchable choices: open it and pick. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Medium' }))
    await userEvent.click(await screen.findByRole('option', { name: /High/ }))
    await expect(args.onChange).toHaveBeenCalledWith('high')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

/** Named for what it chooses, with an icon, as the Codex speed is. */
export const WithIcon: Story = {
  args: {
    selectedId: 'priority',
    value: 'Fast',
    ariaLabel: 'Speed: Fast',
    icon: <Zap className="h-3.5 w-3.5" aria-hidden />,
    items: [
      { id: 'default', label: 'Standard' },
      { id: 'priority', label: 'Fast', description: 'Priority processing.' },
    ],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Speed: Fast' }),
    ).toBeVisible()
  },
}

/** Locked while a turn runs. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Medium' }),
    ).toBeDisabled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
