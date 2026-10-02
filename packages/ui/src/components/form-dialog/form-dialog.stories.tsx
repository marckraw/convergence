import type { Meta, StoryObj } from '@storybook/react-vite'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { arrived } from '../../../.storybook/motion-testing'
import { cn } from '#lib/cn.pure'
import { Button } from '../button/button'
import { dialogRail, dialogSplit } from '../dialog/dialog.styles'
import { IconButton } from '../icon-button/icon-button'
import { Input } from '../input/input'
import { FormDialog, type FormDialogSaves } from './form-dialog'

type EditProfileProps = {
  saves: FormDialogSaves
  onSave: () => void
  onRefresh?: () => void
  pending?: boolean
  error?: string
  errorDetail?: string
  /** How many settings the body lists. */
  fields?: number
  saveDisabledReason?: string
  saveShortcut?: string
}

/** Editing a tunnel profile: a few fields, ending the way R6 says. */
function EditProfile({
  saves,
  onSave,
  onRefresh,
  pending,
  error,
  errorDetail,
  fields = 2,
  saveDisabledReason,
  saveShortcut,
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
        errorDetail={errorDetail}
        saveDisabledReason={saveDisabledReason}
        saveShortcut={saveShortcut}
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

/**
 * Failed: the error is announced over the buttons, its reason on the line
 * under it (R10), and Save tries again.
 */
export const Failed: Story = {
  args: {
    error: 'Couldn’t save the profile.',
    errorDetail: 'The port is already in use.',
  },
  play: async ({ args, canvas, userEvent }) => {
    const { dialog } = await open(canvas, userEvent)
    await arrived(dialog)
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Couldn’t save the profile. The port is already in use.',
    )
    // The reason is its own line, under the failure.
    await expect(
      within(within(dialog).getByRole('alert')).getByText(
        'The port is already in use.',
      ),
    ).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await expect(args.onSave).toHaveBeenCalledOnce()
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

/**
 * A form that also saves on ⌘↵ says so: Save's tooltip shows the key, and
 * the button's name stays "Save" (DS-34).
 */
export const Shortcut: Story = {
  args: { saveShortcut: '⌘↵' },
  play: async ({ canvas, userEvent }) => {
    const { dialog } = await open(canvas, userEvent)
    const save = within(dialog).getByRole('button', { name: 'Save' })
    await expect(save).toHaveAttribute('data-tooltip', 'Save')
    await expect(save).toHaveAttribute('data-tooltip-shortcut', '⌘↵')
    await expect(save).not.toHaveAttribute('aria-description')
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

/**
 * Settings: opened by its own trigger, tall, and flush, so a side list and a
 * scrolling page sit side by side (`dialogSplit`, `dialogRail`); every change
 * is kept, so it ends in Done.
 */
function SettingsDialog() {
  const [open, setOpen] = useState(false)
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="secondary">Settings</Button>}
      title="Settings"
      size="xl"
      height="tall"
      flush
      saves="as-you-go"
    >
      <div className={dialogSplit}>
        <nav
          aria-label="Settings sections"
          className={cn(dialogRail, 'p-3 text-sm sm:w-48')}
        >
          Notifications
        </nav>
        <div
          data-testid="settings-page"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
        >
          {Array.from({ length: 60 }, (_, index) => (
            <p key={index} className="text-sm">
              Setting {index + 1}
            </p>
          ))}
        </div>
      </div>
    </FormDialog>
  )
}

/** Trigger, tall and flush: the page scrolls beside its list, and Done stays. */
export const Flush: Story = {
  render: () => <SettingsDialog />,
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Settings' })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    await arrived(dialog)
    await expect(dialog).toHaveAttribute('data-height', 'tall')
    // Saves as you go: no form to submit, one Done.
    await expect(dialog.querySelector('form')).toBeNull()
    await expect(
      within(dialog).getByRole('navigation', { name: 'Settings sections' }),
    ).toBeVisible()
    const page = within(dialog).getByTestId('settings-page')
    await expect(page.scrollHeight).toBeGreaterThan(page.clientHeight)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
