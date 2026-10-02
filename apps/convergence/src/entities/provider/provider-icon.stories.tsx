import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, waitFor } from 'storybook/test'
import { ProviderIcon } from './provider-icon.presentational'

/** Each provider the app draws a logo for, and one it doesn't know. */
const PROVIDERS = [
  { providerId: 'claude-code', name: 'Claude Code' },
  { providerId: 'codex', name: 'Codex' },
  { providerId: 'pi', name: 'Pi' },
  { providerId: 'cursor', name: 'Cursor' },
  { providerId: 'gemini', vendorLabel: 'Google', name: 'Gemini' },
  { providerId: 'openrouter', vendorLabel: 'OpenRouter', name: 'OpenRouter' },
  { providerId: 'acme-local', vendorLabel: 'Acme Labs', name: 'Acme' },
]

function AllProviders() {
  return (
    <ul
      aria-label="Providers"
      className="flex items-center gap-3 rounded-md bg-canvas p-4 text-ink"
    >
      {PROVIDERS.map((provider) => (
        <li key={provider.providerId} className="flex">
          <ProviderIcon {...provider} />
        </li>
      ))}
    </ul>
  )
}

const meta = {
  title: 'Entities/Provider/Provider icon',
  component: ProviderIcon,
  args: { providerId: 'claude-code' },
} satisfies Meta<typeof ProviderIcon>

export default meta

type Story = StoryObj<typeof meta>

const bubble = () => screen.findByRole('tooltip', {}, { timeout: 2000 })

/**
 * A provider's logo, drawn in the text's colour, decoration to a screen
 * reader; resting the pointer on it names the provider in our tooltip.
 */
export const Default: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const icon = canvasElement.querySelector('[aria-hidden="true"]')!
    await expect(icon).toBeVisible()
    await expect(icon).not.toHaveAttribute('title')
    await userEvent.hover(icon)
    await expect(await bubble()).toHaveTextContent('Anthropic')
    await userEvent.unhover(icon)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  },
}

/** Every logo, and the initials of a provider with none. */
export const All: Story = {
  render: () => <AllProviders />,
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(PROVIDERS.length)
    await expect(canvas.getByText('AL')).toBeVisible()
  },
}

export const Dark: Story = {
  ...All,
  globals: { theme: 'dark' },
}

/** Inside a control that names it already: no tooltip of its own. */
export const Empty: Story = {
  args: { title: '' },
  play: async ({ canvasElement, userEvent }) => {
    const icon = canvasElement.querySelector('[aria-hidden="true"]')!
    await expect(icon).not.toHaveAttribute('data-tooltip')
    await userEvent.hover(icon)
    await new Promise((resolve) => setTimeout(resolve, 400))
    await expect(screen.queryByRole('tooltip')).toBeNull()
  },
}
