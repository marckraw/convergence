import type { Meta, StoryObj } from '@storybook/react-vite'
import { RefreshCw } from 'lucide-react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import {
  arrived,
  snapshotWhileAnimating,
} from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import { IconButton } from '../icon-button/icon-button'
import { Input } from '../input/input'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  type DialogSize,
  DialogTitle,
  DialogTrigger,
} from './dialog'

type RenameConversationProps = {
  /** What the description says. */
  description: string
  onRename: (name: string) => void
  /** How wide it opens. */
  size?: DialogSize
}

/**
 * Renaming a conversation: a title, a line of help, one field, Cancel and
 * Save, in the dialog's own header, body and footer.
 */
function RenameConversation({
  description,
  onRename,
  size,
}: RenameConversationProps) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" />}>
        Rename conversation
      </DialogTrigger>
      <DialogContent size={size}>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            onRename(
              new FormData(event.currentTarget).get('name')?.toString() ?? '',
            )
          }}
        >
          <DialogHeader>
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
          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>
              Cancel
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

/** Opens from its trigger, named by its title, and takes the focus to its first field. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Rename conversation' })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', {
      name: 'Rename conversation',
    })
    // It grows in as it fades in, then stands at full size.
    const opening = await snapshotWhileAnimating(dialog, 'opacity')
    await expect(opening.scale).toBeLessThan(1)
    await arrived(dialog)
    await expect(dialog).toHaveAccessibleDescription(
      'The new name shows in the sidebar and in Mission Control.',
    )
    const field = within(dialog).getByRole('textbox', {
      name: 'Conversation name',
    })
    await waitFor(() => expect(field).toHaveFocus())
    await userEvent.keyboard('Release notes')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await expect(args.onRename).toHaveBeenCalledWith('Release notes')
  },
}

/**
 * Cancel, the ✕, Escape and a press outside each close it, and the focus
 * goes back to the trigger.
 */
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
    await expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await dialogClosed()
    await expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    dialog = await screen.findByRole('dialog')
    await arrived(dialog)
    // The scrim around the box: a press there is outside the dialog.
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: document.querySelector<HTMLElement>(
        '[data-slot="dialog-viewport"]',
      )!,
      coords: { clientX: 4, clientY: 4 },
    })
    await dialogClosed()
    await expect(trigger).toHaveFocus()
  },
}

/** Tab stays inside while it's open: past the last control it comes round to the first. */
export const FocusTrap: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Rename conversation' }),
    )
    const dialog = await screen.findByRole('dialog')
    const field = within(dialog).getByRole('textbox')
    await waitFor(() => expect(field).toHaveFocus())
    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()
    await expect(
      within(dialog).getByRole('button', { name: 'Close' }),
    ).toHaveFocus()
    // Past the last control, the trap's guard hands the focus round.
    await userEvent.tab()
    await waitFor(() => expect(field).toHaveFocus())
    await arrived(dialog)
  },
}

/** Long: the body scrolls; the header and the footer stay. */
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
    await arrived(dialog)
    const box = dialog.getBoundingClientRect()
    await expect(box.top).toBeGreaterThanOrEqual(0)
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
    await expect(
      within(dialog).getByRole('button', { name: 'Save' }),
    ).toBeVisible()
  },
}

/** Every width: 420, 560, 720 (the default), 960 and 1280 px, at most the window. */
export const Sizes: Story = {
  args: { size: 'sm' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Rename conversation' }),
    )
    const dialog = await screen.findByRole('dialog')
    await arrived(dialog)
    await expect(dialog).toHaveAttribute('data-size', 'sm')
    await expect(dialog.getBoundingClientRect().width).toBe(
      Math.min(420, window.innerWidth - 32),
    )
  },
}

export const Medium: Story = {
  ...Sizes,
  args: { size: 'md' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Rename conversation' }),
    )
    const dialog = await screen.findByRole('dialog')
    await arrived(dialog)
    await expect(dialog).toHaveAttribute('data-size', 'md')
    await expect(dialog.getBoundingClientRect().width).toBe(
      Math.min(560, window.innerWidth - 32),
    )
  },
}

export const ExtraLarge: Story = {
  args: { size: '2xl' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Rename conversation' }),
    )
    const dialog = await screen.findByRole('dialog')
    await arrived(dialog)
    await expect(dialog).toHaveAttribute('data-size', '2xl')
    await expect(dialog.getBoundingClientRect().width).toBe(
      Math.min(1280, window.innerWidth - 32),
    )
  },
}

/**
 * Tall: one height whatever it holds (92% of the window, at most 960 px), so a
 * dialog with tabs or a list that streams in doesn't jump as they change.
 */
function ProviderLog() {
  return (
    <Dialog defaultOpen>
      <DialogContent size="xl" height="tall">
        <DialogHeader>
          <DialogTitle>Provider debug log</DialogTitle>
          <DialogDescription>Every event, as it arrives.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm">No events captured yet.</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export const Tall: Story = {
  render: () => <ProviderLog />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Provider debug log',
    })
    await arrived(dialog)
    await expect(dialog).toHaveAttribute('data-height', 'tall')
    // Nearly empty, it still stands at the tall height.
    await expect(dialog.getBoundingClientRect().height).toBeCloseTo(
      Math.min(window.innerHeight * 0.92, 960),
      0,
    )
  },
}

/** A refresh in the header, before the ✕ (R6), and no footer: a dialog you look at and leave. */
function ProviderStatus({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Dialog defaultOpen>
      <DialogContent size="md">
        <DialogHeader
          actions={
            <IconButton label="Refresh" size="sm" onClick={onRefresh}>
              <RefreshCw />
            </IconButton>
          }
        >
          <DialogTitle>Providers</DialogTitle>
          <DialogDescription>
            Which agents are installed and signed in.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm">Claude Code 2.4.1 is up to date.</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export const HeaderActions: Story = {
  render: () => <ProviderStatus onRefresh={fn()} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Providers' })
    const buttons = within(dialog).getAllByRole('button')
    // Refresh, then the ✕: the header's actions come before the close.
    await expect(
      buttons.map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Refresh', 'Close'])
    await arrived(dialog)
  },
}

/**
 * A picker's dialog: a toolbar header, one row with the search where the title
 * would be (the title is for a screen reader), the line under it and room for
 * the ✕, at the tall height (DS-17: the model picker's shape).
 */
function PickModel() {
  return (
    <Dialog defaultOpen>
      <DialogContent size="xl" height="tall">
        <DialogTitle className="sr-only">Select model</DialogTitle>
        <DialogHeader variant="toolbar">
          <Input
            aria-label="Search models"
            placeholder="Search models…"
            className="min-w-0 flex-1"
          />
        </DialogHeader>
        <DialogBody>
          <p className="text-sm">Claude Opus 5.5</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export const ToolbarHeader: Story = {
  render: () => <PickModel />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Select model' })
    await arrived(dialog)
    const header = dialog.querySelector('[data-slot="dialog-header"]')!
    await expect(header).toHaveAttribute('data-variant', 'toolbar')
    // The search ends before the ✕: the header keeps room for it.
    const search = within(dialog).getByRole('textbox', {
      name: 'Search models',
    })
    const close = within(dialog).getByRole('button', { name: 'Close' })
    await expect(search.getBoundingClientRect().right).toBeLessThanOrEqual(
      close.getBoundingClientRect().left,
    )
  },
}

/** A dialog over a dialog: Escape closes the top one, and the focus goes back underneath. */
function NestedDialogs() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" />}>
        Choose a model
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Choose a model</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Dialog>
            <DialogTrigger render={<Button variant="secondary" />}>
              Filter models
            </DialogTrigger>
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>Filter models</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <Input aria-label="Provider" />
              </DialogBody>
            </DialogContent>
          </Dialog>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export const Nested: Story = {
  render: () => <NestedDialogs />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Choose a model' }),
    )
    const outer = await screen.findByRole('dialog', { name: 'Choose a model' })
    const filter = within(outer).getByRole('button', { name: 'Filter models' })
    await userEvent.click(filter)
    const inner = await screen.findByRole('dialog', { name: 'Filter models' })
    await waitFor(() =>
      expect(within(inner).getByRole('textbox')).toHaveFocus(),
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Filter models' }),
      ).toBeNull(),
    )
    await arrived(outer)
    await expect(
      screen.getByRole('dialog', { name: 'Choose a model' }),
    ).toBeVisible()
    await expect(filter).toHaveFocus()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Reduced motion: the dialog fades in where it stands, without growing. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Rename conversation' }),
    )
    const dialog = await screen.findByRole('dialog')
    const opening = await snapshotWhileAnimating(dialog, 'opacity')
    await expect(opening.opacity).toBeLessThan(1)
    await expect(opening.scale).toBe(1)
    await arrived(dialog)
  },
}
