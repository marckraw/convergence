import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { TextLink } from './text-link'

/** A link in a sentence, as a settings description writes one. */
function Sentence() {
  return (
    <p className="w-80 rounded-md bg-canvas p-4 text-sm text-ink-muted">
      Pick the model in <TextLink href="#settings">Session defaults</TextLink>{' '}
      before you start.
    </p>
  )
}

const meta = {
  title: 'Components/TextLink',
  component: Sentence,
} satisfies Meta<typeof Sentence>

export default meta

type Story = StoryObj<typeof meta>

/** The strong ink, underlined at 40 %; the focus ring is drawn for the keyboard. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const link = canvas.getByRole('link', { name: 'Session defaults' })
    await expect(getComputedStyle(link).color).toBe(tokenColor('--strong'))
    await expect(getComputedStyle(link).textDecorationLine).toBe('underline')
    await expect(link).not.toHaveAttribute('target')
    await userEvent.tab()
    await expect(link).toHaveFocus()
    await expect(getComputedStyle(link).outlineStyle).toBe('solid')
  },
}

/** External: a new window, no referrer, and it says it opens in the browser. */
export const External: Story = {
  render: () => (
    <p className="w-80 rounded-md bg-canvas p-4 text-sm text-ink-muted">
      Read the{' '}
      <TextLink href="https://docs.anthropic.com" external>
        provider docs
      </TextLink>{' '}
      first.
    </p>
  ),
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', {
      name: 'provider docs (opens in browser)',
    })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noreferrer')
    await expect(link.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'Session defaults' })
    await expect(getComputedStyle(link).color).toBe(tokenColor('--strong'))
  },
}
