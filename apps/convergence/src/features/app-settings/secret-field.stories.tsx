import type { Meta, StoryObj } from '@storybook/react-vite'
import { Notice } from '@convergence/ui'
import { expect, fn } from 'storybook/test'
import { SecretField } from './secret-field.presentational'

const meta = {
  title: 'Features/AppSettings/SecretField',
  component: SecretField,
  args: {
    title: 'OpenRouter',
    status: 'Not configured',
    label: 'API key',
    noun: 'key',
    value: '',
    placeholder: 'sk-or-…',
    revealed: false,
    configured: false,
    saving: false,
    onValueChange: fn(),
    onToggleReveal: fn(),
    onSave: fn(),
    onRemove: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SecretField>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Nothing saved yet: the field takes a key, the eye shows it, and Save waits
 * for one; Remove… says there's nothing to remove (R2).
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Not configured')).toBeVisible()
    const field = canvas.getByLabelText('API key')
    await expect(field).toHaveAttribute('type', 'password')
    await userEvent.type(field, 's')
    await expect(args.onValueChange).toHaveBeenCalledWith('s')
    await userEvent.click(canvas.getByRole('button', { name: 'Show API key' }))
    await expect(args.onToggleReveal).toHaveBeenCalledOnce()
    const save = canvas.getByRole('button', { name: 'Save key' })
    await expect(save).toHaveAttribute('aria-disabled', 'true')
    await expect(save).toHaveAccessibleDescription('Paste a key first.')
    await expect(
      canvas.getByRole('button', { name: 'Remove key…' }),
    ).toHaveAccessibleDescription('No key is saved.')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A key is saved and a new one typed: Replace saves it, Remove… asks first. */
export const Replace: Story = {
  args: {
    status: 'Configured in Keychain, key hidden',
    configured: true,
    value: 'sk-or-new',
    revealed: true,
    placeholder: 'Saved key hidden',
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByLabelText('API key')).toHaveAttribute(
      'type',
      'text',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Replace key' }))
    await expect(args.onSave).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Remove key…' }))
    await expect(args.onRemove).toHaveBeenCalledOnce()
  },
}

/** Saving: Save is busy and keeps its place; the field waits. */
export const Busy: Story = {
  args: { configured: true, value: 'sk-or-new', saving: true },
  play: async ({ canvas }) => {
    // Busy, it says so in its words: "Saving…" (R10).
    const save = canvas.getByRole('button', { name: 'Saving…' })
    await expect(save).toHaveAttribute('aria-busy', 'true')
    await expect(canvas.getByLabelText('API key')).toBeDisabled()
  },
}

/**
 * One of several on a card (an execution host's token): every control is
 * named for its owner, and while the owner can't take a token, Save and
 * Remove… say why.
 */
export const Disabled: Story = {
  args: {
    title: 'Daemon API token',
    status: 'Enter a valid URL first.',
    label: 'Execution host token',
    noun: 'token',
    owner: 'kuba-vps',
    placeholder: 'Bearer token',
    blocked: 'Enter a valid URL first.',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Execution host token')).toBeDisabled()
    for (const name of [
      'Save token for kuba-vps',
      'Remove token for kuba-vps',
    ]) {
      const button = canvas.getByRole('button', { name })
      await expect(button).toHaveAttribute('aria-disabled', 'true')
      await expect(button).toHaveAccessibleDescription(
        'Enter a valid URL first.',
      )
    }
    await expect(
      canvas.getByRole('button', { name: 'Show token for kuba-vps' }),
    ).toBeVisible()
  },
}

/** What happened shows under the field. */
export const Failed: Story = {
  args: {
    configured: true,
    status: 'Configured in Keychain, key hidden',
    children: (
      <Notice
        tone="danger"
        title="Couldn’t save the OpenRouter API key."
        className="mt-4"
      />
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Couldn’t save the OpenRouter API key.',
    )
  },
}
