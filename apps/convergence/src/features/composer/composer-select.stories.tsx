import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { ComposerSelect } from './composer-select.presentational'

const meta = {
  title: 'Features/Composer/ComposerSelect',
  component: ComposerSelect,
  args: {
    label: 'Provider',
    selectedId: 'claude-code',
    placeholder: 'Select provider',
    items: [
      { id: 'claude-code', label: 'Anthropic', description: 'Claude Code' },
      { id: 'codex', label: 'OpenAI', description: 'Codex' },
      {
        id: 'cursor',
        label: 'Cursor',
        description: "grok-mac doesn't run Cursor.",
        disabled: true,
      },
    ],
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ComposerSelect>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The provider in the composer's toolbar: named by what it picks, showing
 * its value, in the row's one size. Open it and pick; a provider the machine
 * won't run is listed, unavailable, with its reason.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const picker = canvas.getByRole('combobox', { name: 'Provider' })
    await expect(picker).toHaveTextContent('Anthropic')
    await expect(picker.getBoundingClientRect().height).toBe(28)
    await userEvent.click(picker)
    const list = await screen.findByRole('listbox')
    const cursor = within(list).getByRole('option', { name: /Cursor/ })
    await expect(cursor).toHaveAttribute('aria-disabled', 'true')
    await expect(cursor).toHaveTextContent("grok-mac doesn't run Cursor.")
    await userEvent.click(within(list).getByRole('option', { name: /OpenAI/ }))
    await expect(args.onChange).toHaveBeenCalledWith('codex')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

/** Nothing chosen yet: the placeholder says what to do. */
export const Empty: Story = {
  args: { selectedId: '' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Provider' }),
    ).toHaveTextContent('Select provider')
  },
}

/**
 * A session whose provider has left the catalog (MAR-2550): the trigger
 * still says what the row says, in the fallback's words.
 */
export const Stranded: Story = {
  args: {
    selectedId: 'shell',
    fallback: 'shell (unavailable)',
    disabled: true,
  },
  play: async ({ canvas }) => {
    const picker = canvas.getByRole('combobox', { name: 'Provider' })
    await expect(picker).toHaveTextContent('shell (unavailable)')
    await expect(picker).toHaveAttribute('data-disabled')
  },
}

/** Locked while a session fixes it. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Provider' }),
    ).toHaveAttribute('data-disabled')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
