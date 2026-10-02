import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { arrived } from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import { Checkbox } from '../checkbox/checkbox'
import { ConfirmDialog, type ConfirmVariant } from './confirm-dialog'
import { useConfirm } from './confirm-host'

type DeleteConversationProps = {
  onConfirm: () => void
  variant?: ConfirmVariant
  description?: string
  pending?: boolean
  error?: string
}

/** Deleting a conversation, from a button that opens the question. */
function DeleteConversation({
  onConfirm,
  variant = 'danger',
  description = 'Its transcript and its changes list go for good. The files it changed stay as they are.',
  pending,
  error,
}: DeleteConversationProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Delete conversation…
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete “Release notes”?"
        description={description}
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        variant={variant}
        pending={pending}
        error={error}
        onConfirm={onConfirm}
      />
    </>
  )
}

const closed = () =>
  waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

const meta = {
  title: 'Components/ConfirmDialog',
  component: DeleteConversation,
  args: { onConfirm: fn() },
} satisfies Meta<typeof DeleteConversation>

export default meta

type Story = StoryObj<typeof meta>

const open = async (
  canvas: { getByRole: typeof screen.getByRole },
  userEvent: { click: (element: Element) => Promise<void> },
) => {
  const trigger = canvas.getByRole('button', { name: 'Delete conversation…' })
  await userEvent.click(trigger)
  const dialog = await screen.findByRole('alertdialog', {
    name: 'Delete “Release notes”?',
  })
  return { trigger, dialog }
}

/**
 * A plain question: the focus starts on the action, which says what it does;
 * pressing it answers.
 */
export const Default: Story = {
  args: { variant: 'default' },
  play: async ({ args, canvas, userEvent }) => {
    const { dialog } = await open(canvas, userEvent)
    await expect(dialog).toHaveAccessibleDescription(/go for good/)
    const confirm = within(dialog).getByRole('button', { name: 'Delete' })
    await waitFor(() => expect(confirm).toHaveFocus())
    await userEvent.click(confirm)
    await expect(args.onConfirm).toHaveBeenCalledOnce()
    await arrived(dialog)
  },
}

/**
 * Danger (R5): the red button names the action, the focus starts on Cancel,
 * and a stray Enter keeps everything as it was.
 */
export const Danger: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const { trigger, dialog } = await open(canvas, userEvent)
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(cancel).toHaveFocus())
    await userEvent.keyboard('{Enter}')
    await closed()
    await expect(args.onConfirm).not.toHaveBeenCalled()
    await expect(trigger).toHaveFocus()

    // Escape, too, keeps everything.
    await userEvent.click(trigger)
    await screen.findByRole('alertdialog')
    await userEvent.keyboard('{Escape}')
    await closed()
    await expect(args.onConfirm).not.toHaveBeenCalled()
  },
}

/** Busy: after 300 ms the button says what it is doing, and more presses wait. */
export const Busy: Story = {
  args: { pending: true },
  play: async ({ args, canvas, userEvent }) => {
    const { dialog } = await open(canvas, userEvent)
    const confirm = within(dialog).getByRole('button', { name: 'Delete' })
    await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'), {
      timeout: 1_000,
    })
    await expect(confirm).toHaveTextContent('Deleting…')
    await userEvent.click(confirm)
    await expect(args.onConfirm).not.toHaveBeenCalled()
    await arrived(dialog)
  },
}

/** Failed: the error is announced above the buttons, and the button tries again. */
export const Failed: Story = {
  args: {
    error:
      'Couldn’t delete the conversation. The agent is still writing to it.',
  },
  play: async ({ args, canvas, userEvent }) => {
    const { dialog } = await open(canvas, userEvent)
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Couldn’t delete the conversation.',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' }),
    )
    await expect(args.onConfirm).toHaveBeenCalledOnce()
    await arrived(dialog)
  },
}

/** Long: a long explanation wraps; the dialog stays inside the window. */
export const Long: Story = {
  args: {
    description: Array.from(
      { length: 8 },
      () =>
        'Its transcript, its changes list and its attachments go for good, and every Space it was linked to forgets it.',
    ).join(' '),
  },
  play: async ({ canvas, userEvent }) => {
    const { dialog } = await open(canvas, userEvent)
    await arrived(dialog)
    const box = dialog.getBoundingClientRect()
    await expect(box.top).toBeGreaterThanOrEqual(0)
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
  },
}

export const Dark: Story = {
  ...Danger,
  globals: { theme: 'dark' },
}

/** Removing an account whose files only it holds: the box must be ticked first. */
function RemoveAccount({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  const [ticked, setTicked] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Remove…
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove “work@example.com”?"
        description="Its private history in projects is deleted with it."
        confirmLabel="Sign out and delete private history"
        variant="danger"
        confirmDisabledReason={
          ticked ? undefined : 'Tick the box to delete the private files first.'
        }
        onConfirm={onConfirm}
      >
        <label className="flex items-start gap-2">
          <Checkbox
            checked={ticked}
            onCheckedChange={(checked) => setTicked(checked)}
          />
          Delete the private files in projects
        </label>
      </ConfirmDialog>
    </>
  )
}

/**
 * Gated (R2): what it asks for first is inside it; until then the action is
 * unavailable, says why, and pressing it does nothing.
 */
export const Gated: Story = {
  render: (args) => <RemoveAccount onConfirm={args.onConfirm} />,
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Remove…' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Remove “work@example.com”?',
    })
    const confirm = within(dialog).getByRole('button', {
      name: 'Sign out and delete private history',
    })
    await expect(confirm).toHaveAttribute('aria-disabled', 'true')
    await expect(confirm).toHaveAccessibleDescription(
      'Tick the box to delete the private files first.',
    )
    await userEvent.click(confirm)
    await expect(args.onConfirm).not.toHaveBeenCalled()
    await userEvent.click(
      within(dialog).getByRole('checkbox', {
        name: /Delete the private files/,
      }),
    )
    await expect(confirm).not.toHaveAttribute('aria-disabled')
    await userEvent.click(confirm)
    await expect(args.onConfirm).toHaveBeenCalledOnce()
    await arrived(dialog)
  },
}

const deleted = fn()
const kept = fn()

/** `useConfirm()`: one line in a handler, answered by the host UiProvider mounts. */
function DeletePrompt({
  onDeleted,
  onKept,
}: {
  onDeleted: () => void
  onKept: () => void
}) {
  const confirm = useConfirm()
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        const confirmed = await confirm({
          title: 'Delete “Weekly review”?',
          description: 'The prompt goes from the library for every project.',
          confirmLabel: 'Delete prompt',
          variant: 'danger',
        })
        if (confirmed) onDeleted()
        else onKept()
      }}
    >
      Delete prompt…
    </Button>
  )
}

export const UseConfirm: Story = {
  render: () => <DeletePrompt onDeleted={deleted} onKept={kept} />,
  play: async ({ canvas, userEvent }) => {
    deleted.mockClear()
    kept.mockClear()
    const trigger = canvas.getByRole('button', { name: 'Delete prompt…' })
    await userEvent.click(trigger)
    let dialog = await screen.findByRole('alertdialog', {
      name: 'Delete “Weekly review”?',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await waitFor(() => expect(kept).toHaveBeenCalledOnce())
    await closed()
    await expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    dialog = await screen.findByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete prompt' }),
    )
    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
    await closed()
  },
}
