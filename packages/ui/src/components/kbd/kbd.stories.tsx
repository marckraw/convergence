import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { Kbd } from './kbd'

/** Key hints as the app shows them: beside a word that says what they do. */
function KeyHints() {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-background p-3 text-sm text-muted-foreground">
      <p className="flex items-center gap-1.5">
        Command Center <Kbd>⌘K</Kbd>
      </p>
      <p className="flex items-center gap-1.5">
        Send <Kbd>⌘↵</Kbd>
      </p>
      <p className="flex items-center gap-1.5">
        Command palette <Kbd>⇧⌘P</Kbd>
      </p>
    </div>
  )
}

// No empty, error or busy state: a key is a key.
const meta = {
  title: 'Primitives/Kbd',
  component: KeyHints,
} satisfies Meta<typeof KeyHints>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The boxed look: outlined in the border color, in the text font, as tall as
 * a badge (20 px). It's a `<kbd>`, so screen readers know it's a key.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const key = canvas.getByText('⌘K')
    await expect(key.tagName).toBe('KBD')
    await expect(key.getBoundingClientRect().height).toBe(20)
    await expect(getComputedStyle(key).fontFamily).not.toMatch(/mono/i)
  },
}

/** A long chord keeps each key whole, one box a key. */
export const Long: Story = {
  render: () => (
    <p className="flex w-60 flex-wrap items-center gap-1 rounded-md bg-background p-3 text-sm text-muted-foreground">
      Mark everything read <Kbd>Ctrl</Kbd> <Kbd>Shift</Kbd> <Kbd>Option</Kbd>{' '}
      <Kbd>Escape</Kbd>
    </p>
  ),
  play: async ({ canvas }) => {
    for (const name of ['Ctrl', 'Shift', 'Option', 'Escape']) {
      const key = canvas.getByText(name)
      await expect(key.scrollWidth).toBeLessThanOrEqual(key.clientWidth)
    }
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}
