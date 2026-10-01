import type { Meta, StoryObj } from '@storybook/react-vite'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { arrived } from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import { IconButton } from '../icon-button/icon-button'
import { Input } from '../input/input'
import { FormDialog, type FormDialogSaves } from './form-dialog'

type EditProfileProps = {
  saves: FormDialogSaves
  onSave: () => void
  onRefresh?: () => void
  pending?: boolean
  error?: string
  /** How many settings the body lists. */
  fields?: number
  saveDisabledReason?: string
}

/** Editing a tunnel profile: a few fields, ending the way R6 says. */
function EditProfile({
  saves,
  onSave,
  onRefresh,
  pending,
  error,
  fields = 2,
  saveDisabledReason,
}: EditProfileProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Edit profile…
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Edit tunnel profile"
        description="Where the local model runs and how Convergence reaches it."
        size="md"
        saves={saves}
        onSave={onSave}
        pending={pending}
        error={error}
        saveDisabledReason={saveDisabledReason}
        headerActions={
          onRefresh ? (
            <IconButton label="Refresh" size="sm" onClick={onRefresh}>
              <RefreshCw />
            </IconButton>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3">
          {Array.from({ length: fields }, (_, index) => (
            <Input
              key={index}
              aria-label={index === 0 ? 'Profile name' : `Setting ${index + 1}`}
              defaultValue={index === 0 ? 'Studio Mac' : ''}
            />
          ))}
        </div>
      </FormDialog>
    </>
  )
}

const meta = {
  title: 'Components/FormDialog',
  component: EditProfile,
  args: { saves: 'on-save', onSave: fn() },
} satisfies Meta<typeof EditProfile>

export default meta

type Story = StoryObj<typeof meta>

const open = async (
  canvas: { getByRole: typeof screen.getByRole },
  userEvent: { click: (element: Element) => Promise<void> },
) => {
  const trigger = canvas.getByRole('button', { name: 'Edit profile…' })
  await userEvent.click(trigger)
  const dialog = await screen.findByRole('dialog', {
    name: 'Edit tunnel profile',
  })
  return { trigger, dialog }
}

/** The dialog's buttons, in the order the page has them, found by name. */
const expectButtonsInOrder = async (dialog: HTMLElement, names: string[]) =>
  expect(within(dialog).getAllByRole('button')).toEqual(
    names.map((name) => within(dialog).getByRole('button', { name })),
  )

/**
 * Saves on demand (R6): Cancel, then Save, last; Enter in a field saves, and
 * Cancel keeps nothing and gives the focus back.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const { trigger, dialog } = await open(canvas, userEvent)
    await expectButtonsInOrder(dialog, ['Cancel', 'Save', 'Close'])
    const name = within(dialog).getByRole('textbox', { name: 'Profile name' })
    await waitFor(() => expect(name).toHaveFocus())
    await userEvent.keyboard('{Enter}')
    await expect(args.onSave).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

/** Saves as you go (R6): one Done, and nothing else to press. */
export const AsYouGo: Story = {
  args: { saves: 'as-you-go', onRefresh: fn() },
  play: async ({ canvas, userEvent }) => {
    const { dialog } = await open(canvas, userEvent)
    // Refresh sits in the header before the ✕; the footer is one Done.
    await expectButtonsInOrder(dialog, ['Refresh', 'Done', 'Close'])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Busy: Save says "Saving…" after 300 ms, holds its width, and a second press waits. */
export const Busy: Story = {
  args: { pending: true },
  play: async ({ args, canvas, userEvent }) => {
    const { dialog } = await open(canvas, userEvent)
    const save = within(dialog).getByRole('button', { name: 'Save' })
    await waitFor(() => expect(save).toHaveAttribute('aria-busy', 'true'), {
      timeout: 1_000,
    })
    await expect(save).toHaveTextContent('Saving…')
    await userEvent.click(save)
    await expect(args.onSave).not.toHaveBeenCalled()
    await arrived(dialog)
  },
}

/** Failed: the error is announced over the buttons, and Save tries again. */
export const Failed: Story = {
  args: { error: "Couldn't save the profile. The port is already in use." },
  play: async ({ args, canvas, userEvent }) => {
    const { dialog } = await open(canvas, userEvent)
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      "Couldn't save the profile.",
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await expect(args.onSave).toHaveBeenCalledOnce()
    await arrived(dialog)
  },
}

/** Disabled: Save says why it can't, and stays reachable to say it (R2). */
export const Disabled: Story = {
  args: { saveDisabledReason: 'Give the profile a name first.' },
  play: async ({ args, canvas, userEvent }) => {
    const { dialog } = await open(canvas, userEvent)
    const save = within(dialog).getByRole('button', { name: 'Save' })
    await expect(save).toHaveAttribute('aria-disabled', 'true')
    await expect(save).toHaveAccessibleDescription(
      'Give the profile a name first.',
    )
    await userEvent.keyboard('{Enter}')
    await expect(args.onSave).not.toHaveBeenCalled()
    await arrived(dialog)
  },
}

/** Long: the fields scroll; the title and the buttons stay. */
export const Long: Story = {
  args: { fields: 30 },
  play: async ({ canvas, userEvent }) => {
    const { dialog } = await open(canvas, userEvent)
    await arrived(dialog)
    const box = dialog.getBoundingClientRect()
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
    await expect(
      within(dialog).getByRole('button', { name: 'Save' }),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
