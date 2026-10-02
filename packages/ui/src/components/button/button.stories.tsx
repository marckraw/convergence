import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { expect, fn, screen } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { settled } from '../../../.storybook/motion-testing'
import { Button, type ButtonSize, type ButtonVariant } from './button'

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: {
    children: 'Send',
    onClick: fn(),
  },
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

const VARIANTS: { variant: ButtonVariant; label: string }[] = [
  { variant: 'primary', label: 'Send' },
  { variant: 'secondary', label: 'Cancel' },
  { variant: 'tonal', label: 'Run' },
  { variant: 'ghost', label: 'Mark as read' },
  { variant: 'quiet', label: 'Show details' },
  { variant: 'link', label: 'Reload' },
  { variant: 'danger', label: 'Delete' },
  { variant: 'danger-quiet', label: 'Remove' },
]

const SIZES: { size: ButtonSize; px: number }[] = [
  { size: 'xs', px: 24 },
  { size: 'sm', px: 28 },
  { size: 'md', px: 32 },
  { size: 'lg', px: 36 },
]

/** The spinners a button draws that can be seen: a busy one's, never its hidden twin's. */
const shownSpinners = (element: Element) =>
  [...element.querySelectorAll<SVGElement>('[data-slot="spinner"]')].filter(
    (spinner) => getComputedStyle(spinner).visibility === 'visible',
  )

/**
 * Every variant, named by what it means, at every size of the one scale
 * (R3): 24, 28, 32 and 36 px. The keyboard reaches each and draws the ring.
 */
export const Default: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3 rounded-md bg-canvas p-4">
      {SIZES.map(({ size }) => (
        <div key={size} className="flex flex-wrap items-center gap-2">
          {VARIANTS.map(({ variant, label }) => (
            <Button
              key={variant}
              {...args}
              variant={variant}
              size={size}
            >{`${label} ${size}`}</Button>
          ))}
        </div>
      ))}
    </div>
  ),
  play: async ({ args, canvas, userEvent }) => {
    for (const { size, px } of SIZES) {
      const send = canvas.getByRole('button', { name: `Send ${size}` })
      await expect(send).toHaveAttribute('data-size', size)
      await expect(send.getBoundingClientRect().height).toBe(px)
    }
    // A link has no box: it takes the text's height, whatever the size.
    const link = canvas.getByRole('button', { name: 'Reload lg' })
    await expect(link.getBoundingClientRect().height).toBeLessThan(36)
    // md is the default.
    await userEvent.click(canvas.getByRole('button', { name: 'Send md' }))
    await expect(args.onClick).toHaveBeenCalledOnce()
    // The ring is drawn for the keyboard: a solid line in the ring colour.
    await userEvent.tab()
    const first = canvas.getByRole('button', { name: 'Cancel md' })
    await expect(first).toHaveFocus()
    await settled(first)
    const ring = getComputedStyle(first)
    await expect(ring.outlineStyle).toBe('solid')
    await expect(ring.outlineWidth).toBe('1px')
    await expect(ring.outlineColor).toBe(tokenColor('--ring'))
    // Never a native title (R2).
    for (const button of canvas.getAllByRole('button'))
      await expect(button).not.toHaveAttribute('title')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    const danger = canvas.getByRole('button', { name: 'Delete md' })
    await expect(getComputedStyle(danger).backgroundColor).toBe(
      tokenColor('--destructive'),
    )
  },
}

/** Long: a label doesn't wrap; the button grows. */
export const Long: Story = {
  args: {
    children: 'Send to every conversation in this project, the agents included',
  },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole('button', { name: args.children as string })
    await expect(button.getBoundingClientRect().height).toBe(32)
    await expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth)
  },
}

/** Save, busy from the first click to the next: a dialog's footer, waiting. */
function SaveButton() {
  const [pending, setPending] = useState(false)
  return (
    <Button
      pending={pending}
      pendingLabel="Saving…"
      onClick={() => setPending((busy) => !busy)}
    >
      Save
    </Button>
  )
}

/**
 * Busy (`pending`): a Spinner before a label that says so ("Saving…", R10),
 * and aria-busy. The button is as wide as its busy look from the start, so
 * nothing moves when it goes busy.
 */
export const Busy: Story = {
  render: (args) => (
    <div className="flex items-center gap-2 rounded-md bg-canvas p-3">
      <SaveButton />
      <Button {...args} variant="secondary" pending>
        Join
      </Button>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const save = canvas.getByRole('button', { name: 'Save' })
    await expect(save).not.toHaveAttribute('aria-busy')
    await expect(shownSpinners(save)).toHaveLength(0)
    const idle = save.getBoundingClientRect()

    await userEvent.click(save)
    const saving = canvas.getByRole('button', { name: 'Saving…' })
    await expect(saving).toHaveAttribute('aria-busy', 'true')
    await expect(shownSpinners(saving)).toHaveLength(1)
    const busy = saving.getBoundingClientRect()
    await expect([busy.width, busy.height]).toEqual([idle.width, idle.height])

    const join = canvas.getByRole('button', { name: 'Join' })
    await expect(join).toHaveAttribute('aria-busy', 'true')
  },
}

/**
 * Disabled: plainly disabled, it leaves the tab order. Disabled with a reason
 * (R2), it stays focusable (aria-disabled), says why in its tooltip and
 * announces the reason as its description; a click does nothing.
 */
export const Disabled: Story = {
  render: (args) => (
    <div className="flex items-center gap-2 rounded-md bg-canvas p-3">
      <Button {...args} disabled>
        Send
      </Button>
      <Button
        {...args}
        variant="secondary"
        disabledReason="Open a project first"
      >
        <Plus aria-hidden />
        New conversation
      </Button>
      <Button {...args} variant="danger">
        <Trash2 aria-hidden />
        Delete
      </Button>
    </div>
  ),
  play: async ({ args, canvas, userEvent }) => {
    const send = canvas.getByRole('button', { name: 'Send' })
    await expect(send).toBeDisabled()
    const unavailable = canvas.getByRole('button', {
      name: 'New conversation',
    })
    await expect(unavailable).toHaveAttribute('aria-disabled', 'true')
    await expect(unavailable).toHaveAccessibleDescription(
      'Open a project first',
    )
    await userEvent.tab()
    await expect(unavailable).toHaveFocus()
    await expect(
      await screen.findByRole('tooltip', {}, { timeout: 2000 }),
    ).toHaveTextContent('Open a project first')
    await userEvent.click(unavailable)
    await expect(args.onClick).not.toHaveBeenCalled()
  },
}

/** Reduced motion: nothing shrinks under the pointer; a busy spinner stands still. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  render: (args) => (
    <div className="flex items-center gap-2 rounded-md bg-canvas p-3">
      <Button {...args}>Send</Button>
      <Button {...args} variant="secondary" pending pendingLabel="Saving…">
        Save
      </Button>
    </div>
  ),
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Send' })
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledOnce()
    const [spinner] = shownSpinners(
      canvas.getByRole('button', { name: 'Saving…' }),
    )
    await expect(getComputedStyle(spinner as SVGElement).animationName).toBe(
      'none',
    )
  },
}
