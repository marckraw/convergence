import type { Meta, StoryObj } from '@storybook/react-vite'
import { Zap } from 'lucide-react'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { ComposerSelect } from './composer-select.presentational'

const meta = {
  title: 'Features/Composer/ComposerSelect',
  component: ComposerSelect,
  args: {
    label: 'Reasoning effort',
    selectedId: 'medium',
    value: 'Medium',
    items: [
      { id: 'low', label: 'Low', description: 'Fastest, least thinking.' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High', description: 'Thinks longer.' },
    ],
    onChange: fn(),
    size: 'sm',
  },
} satisfies Meta<typeof ComposerSelect>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One of the composer's searchable choices: named by what it picks, showing
 * its value. Open it and pick.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const picker = canvas.getByRole('combobox', { name: 'Reasoning effort' })
    await expect(picker).toHaveTextContent('Medium')
    await userEvent.click(picker)
    await userEvent.click(await screen.findByRole('option', { name: /High/ }))
    await expect(args.onChange).toHaveBeenCalledWith('high')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

/** With an icon, as the Codex speed is. */
export const WithIcon: Story = {
  args: {
    label: 'Speed',
    selectedId: 'priority',
    value: 'Fast',
    icon: <Zap className="h-3.5 w-3.5" aria-hidden />,
    items: [
      { id: 'default', label: 'Standard' },
      { id: 'priority', label: 'Fast', description: 'Priority processing.' },
    ],
  },
  play: async ({ canvas }) => {
    const speed = canvas.getByRole('combobox', { name: 'Speed' })
    await expect(speed).toBeVisible()
    await expect(speed).toHaveTextContent('Fast')
  },
}

/** Locked while a turn runs. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Reasoning effort' }),
    ).toBeDisabled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
