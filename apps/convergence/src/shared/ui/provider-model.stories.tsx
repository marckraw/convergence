import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen } from 'storybook/test'
import { ProviderModel } from './provider-model.presentational'

const meta = {
  title: 'Components/Shared/Provider model',
  component: ProviderModel,
  args: { providerId: 'claude-code', model: 'claude-opus-4-5' },
  decorators: [
    (Story) => (
      <div className="w-56 rounded-md bg-canvas p-3 text-xs text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProviderModel>

export default meta

type Story = StoryObj<typeof meta>

const bubble = () => screen.findByRole('tooltip', {}, { timeout: 2000 })

/**
 * Which provider and model a session runs on: the provider's logo and the
 * model's name. A screen reader hears both; the tooltip says both too, for
 * the logo and for a name cut short.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const model = canvas.getByText('claude-opus-4-5')
    await expect(model.parentElement).toHaveTextContent(
      'Anthropic · claude-opus-4-5',
    )
    await userEvent.hover(model)
    await expect(await bubble()).toHaveTextContent(
      'Anthropic · claude-opus-4-5',
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A long model name is cut short; the tooltip has it whole. */
export const Long: Story = {
  args: {
    providerId: 'codex',
    model: 'gpt-5.2-codex-max-with-a-very-long-preview-suffix',
  },
  play: async ({ canvas, userEvent }) => {
    const model = canvas.getByText(/^gpt-5\.2-codex-max/)
    await expect(model.scrollWidth).toBeGreaterThan(model.clientWidth)
    await userEvent.hover(model)
    await expect(await bubble()).toHaveTextContent(
      'OpenAI · gpt-5.2-codex-max-with-a-very-long-preview-suffix',
    )
  },
}

/** No model on the record, from a provider with no logo: both in words. */
export const Empty: Story = {
  args: { providerId: 'acme-local', model: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('acme-local · Model not recorded'),
    ).toBeVisible()
  },
}
