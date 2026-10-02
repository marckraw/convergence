import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Textarea } from '../textarea/textarea'
import { ComposerCard } from './composer-card'

const LONG = Array.from(
  { length: 14 },
  (_, line) => `Line ${line + 1} of a message long enough to scroll.`,
).join('\n')

const meta = {
  title: 'Components/ComposerCard',
  component: ComposerCard,
  args: { dragging: false },
  render: (args) => (
    <div className="w-96 bg-canvas p-4">
      <ComposerCard {...args} data-testid="card">
        <Textarea
          aria-label="Message"
          placeholder="Ask anything…"
          variant="bare"
          autoGrow
          maxRows={9}
          rows={1}
          defaultValue={args.dragging ? '' : undefined}
        />
      </ComposerCard>
    </div>
  ),
} satisfies Meta<typeof ComposerCard>

export default meta

type Story = StoryObj<typeof meta>

/** At rest: the surface, a hairline, rounded-xl, and a bare field inside. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const card = canvas.getByTestId('card')
    await expect(getComputedStyle(card).borderTopStyle).toBe('solid')
    await expect(getComputedStyle(card).borderTopColor).toBe(
      tokenColor('--line'),
    )
    await expect(getComputedStyle(card).backgroundColor).toBe(
      tokenColor('--surface'),
    )
    await expect(getComputedStyle(card).borderTopLeftRadius).toBe('12px')
    await expect(card).not.toHaveAttribute('data-dragging')
  },
}

/** A file dragged over it: the edge turns dashed and strong. */
export const Dragging: Story = {
  args: { dragging: true },
  play: async ({ canvas }) => {
    const card = canvas.getByTestId('card')
    await expect(card).toHaveAttribute('data-dragging')
    await expect(getComputedStyle(card).borderTopStyle).toBe('dashed')
    await expect(getComputedStyle(card).borderTopColor).toBe(
      tokenColor('--strong'),
    )
  },
}

/** A long message grows the field to nine lines, then it scrolls. */
export const Long: Story = {
  render: (args) => (
    <div className="w-96 bg-canvas p-4">
      <ComposerCard {...args} data-testid="card">
        <Textarea
          aria-label="Message"
          variant="bare"
          autoGrow
          maxRows={9}
          rows={1}
          defaultValue={LONG}
        />
      </ComposerCard>
    </div>
  ),
  play: async ({ canvas }) => {
    const field = canvas.getByRole('textbox', { name: 'Message' })
    await expect(field.scrollHeight).toBeGreaterThan(field.clientHeight)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
