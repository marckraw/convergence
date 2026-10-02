import type { Meta, StoryObj } from '@storybook/react-vite'
import { Zap } from 'lucide-react'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { ComposerCombobox } from './composer-combobox.presentational'

const meta = {
  title: 'Features/Composer/ComposerCombobox',
  component: ComposerCombobox,
  args: {
    label: 'Approval policy',
    selectedId: 'on-request',
    value: 'On request',
    items: [
      {
        id: 'untrusted',
        label: 'Untrusted',
        description: 'Ask before anything that is not trusted.',
      },
      { id: 'on-request', label: 'On request' },
      { id: 'never', label: 'Never', description: 'Never ask.' },
    ],
    onChange: fn(),
    size: 'sm',
  },
} satisfies Meta<typeof ComposerCombobox>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One of the composer's searchable choices: named by what it picks, showing
 * its value. Open it and pick.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const picker = canvas.getByRole('combobox', { name: 'Approval policy' })
    await expect(picker).toHaveTextContent('On request')
    await userEvent.click(picker)
    await userEvent.click(await screen.findByRole('option', { name: /Never/ }))
    await expect(args.onChange).toHaveBeenCalledWith('never')
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
      canvas.getByRole('combobox', { name: 'Approval policy' }),
    ).toBeDisabled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
