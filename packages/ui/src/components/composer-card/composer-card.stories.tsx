import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Button } from '../button/button'
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

/**
 * The keyboard in the field: the card rings over its edge, as a field's
 * border does (ruling 5). On a button in the card, the button rings, and the
 * card doesn't.
 */
export const Focus: Story = {
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
        />
        <Button variant="quiet" size="sm" className="mt-2">
          Attach
        </Button>
      </ComposerCard>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const card = canvas.getByTestId('card')
    await expect(getComputedStyle(card).outlineStyle).toBe('none')
    await userEvent.tab()
    await expect(canvas.getByRole('textbox', { name: 'Message' })).toHaveFocus()
    await expect(getComputedStyle(card).outlineStyle).toBe('solid')
    await expect(getComputedStyle(card).outlineOffset).toBe('-1px')
    // The ring's colour fades in with the card's colours. (The token is read
    // outside waitFor: reading it adds a probe to the page, which would wake
    // waitFor again, for ever.)
    const focus = tokenColor('--focus')
    await waitFor(() => expect(getComputedStyle(card).outlineColor).toBe(focus))

    await userEvent.tab()
    const attach = canvas.getByRole('button', { name: 'Attach' })
    await expect(attach).toHaveFocus()
    await expect(getComputedStyle(attach).outlineStyle).toBe('solid')
    await expect(getComputedStyle(card).outlineStyle).toBe('none')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const FocusDark: Story = {
  ...Focus,
  globals: { theme: 'dark' },
}
