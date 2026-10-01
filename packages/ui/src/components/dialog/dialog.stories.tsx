import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import {
  settled,
  snapshotWhileAnimating,
} from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import { Input } from '../input/input'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'

type RenameConversationProps = {
  /** What the description says. */
  description: string
  onRename: (name: string) => void
}

/**
 * Renaming a conversation: a title, a line of help, one field, Cancel and
 * Save, laid out as the app's dialogs lay themselves out.
 */
function RenameConversation({
  description,
  onRename,
}: RenameConversationProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Rename conversation</Button>
      </DialogTrigger>
      <DialogContent className="w-[min(560px,calc(100vw-2rem))]">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            onRename(
              new FormData(event.currentTarget).get('name')?.toString() ?? '',
            )
          }}
        >
          <DialogHeader className="border-b border-border/70 px-6 py-5 pr-14">
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input
              name="name"
              aria-label="Conversation name"
              placeholder="Untitled"
            />
          </DialogBody>
          <DialogFooter className="border-t border-border/70 px-6 py-4">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const dialogClosed = () =>
  waitFor(() =>
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull(),
  )

const meta = {
  title: 'Primitives/Dialog',
  component: RenameConversation,
  args: {
    description: 'The new name shows in the sidebar and in Mission Control.',
    onRename: fn(),
  },
} satisfies Meta<typeof RenameConversation>

export default meta

type Story = StoryObj<typeof meta>

/** Opens from its trigger, takes focus, and gives it back when it closes. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Rename conversation' })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', {
      name: 'Rename conversation',
    })
    // It pops in: it grows from 95% as it fades in, then stands at full size.
    const opening = await snapshotWhileAnimating(dialog, 'opacity')
    await expect(opening.scale).toBeLessThan(1)
    await settled(dialog)
    await expect(dialog).toBeVisible()
    // Focus moves into the dialog and the description names it.
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    )
    await expect(dialog).toHaveAccessibleDescription(
      'The new name shows in the sidebar and in Mission Control.',
    )
    const field = within(dialog).getByRole('textbox', {
      name: 'Conversation name',
    })
    await userEvent.click(field)
    await userEvent.keyboard('Release notes')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await expect(args.onRename).toHaveBeenCalledWith('Release notes')
    await settled(dialog)
  },
}

/** Cancel, the ✕ and Escape each close it, and focus returns to the trigger. */
export const Dismiss: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Rename conversation' })

    await userEvent.click(trigger)
    let dialog = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await dialogClosed()
    await expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await dialogClosed()

    await userEvent.click(trigger)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await dialogClosed()
    await expect(trigger).toHaveFocus()
  },
}

/** Long: content taller than the dialog scrolls inside its body. */
export const Long: Story = {
  args: {
    description: Array.from(
      { length: 30 },
      () =>
        'The new name shows in the sidebar, in Mission Control and in every notification this conversation sends, and the agent keeps working while you type.',
    ).join(' '),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Rename conversation' }),
    )
    const dialog = await screen.findByRole('dialog')
    await settled(dialog)
    const box = dialog.getBoundingClientRect()
    // The dialog stays inside the window, whatever it holds.
    await expect(box.top).toBeGreaterThanOrEqual(0)
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
    // Its actions stay reachable.
    await expect(
      within(dialog).getByRole('button', { name: 'Save' }),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Reduced motion: the dialog arrives at once, with nothing to wait for. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Rename conversation' }),
    )
    const dialog = await screen.findByRole('dialog')
    await expect(getComputedStyle(dialog).animationName).toBe('none')
    await expect(dialog.getAnimations()).toHaveLength(0)
    await expect(dialog).toBeVisible()
  },
}
