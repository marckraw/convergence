import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { SpaceCreateDialog } from './space-create.presentational'

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'New Space' })
  await waitFor(() =>
    expect(dialog).toContainElement(document.activeElement as HTMLElement),
  )
  // Rests once its pop-in has finished, so what is checked is what is seen.
  await waitFor(() =>
    expect(
      dialog.getAnimations().filter((a) => a.playState === 'running'),
    ).toHaveLength(0),
  )
  return dialog
}

const meta = {
  title: 'Features/SpaceCreate/SpaceCreateDialog',
  component: SpaceCreateDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    title: 'Launch plan',
    brief:
      'Ship 1.0 by the end of the month. Keep the release notes honest and the installer signed.',
    isSubmitting: false,
    error: null,
    onTitleChange: fn(),
    onBriefChange: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof SpaceCreateDialog>

export default meta

type Story = StoryObj<typeof meta>

/** A title and a brief; Create Space submits, Cancel asks to close. */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    const title = within(dialog).getByLabelText('Title')
    await expect(title).toHaveFocus()
    await userEvent.type(title, '!')
    await expect(args.onTitleChange).toHaveBeenCalledWith('Launch plan!')
    await userEvent.type(within(dialog).getByLabelText('Initial brief'), '.')
    await expect(args.onBriefChange).toHaveBeenCalled()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create Space' }),
    )
    await expect(args.onSubmit).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** Empty: nothing is made until the Space has a title, and Create Space says so (R2). */
export const Empty: Story = {
  args: { title: '', brief: '' },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    const create = within(dialog).getByRole('button', { name: 'Create Space' })
    await expect(create).toHaveAttribute('aria-disabled', 'true')
    await expect(create).toHaveAccessibleDescription(
      'Give the Space a title first.',
    )
    await userEvent.type(within(dialog).getByLabelText('Title'), '{Enter}')
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

/** Busy: the fields lock and, after a moment, the button says it is creating. */
export const Busy: Story = {
  args: { isSubmitting: true },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'New Space' })
    const create = within(dialog).getByRole('button', { name: 'Create Space' })
    await waitFor(() => expect(create).toHaveAttribute('aria-busy', 'true'), {
      timeout: 1_000,
    })
    await expect(create).toHaveTextContent('Creating…')
    await expect(within(dialog).getByLabelText('Title')).toBeDisabled()
    await expect(within(dialog).getByLabelText('Initial brief')).toBeDisabled()
  },
}

/** Failed: the error is announced over the buttons, and the form can be sent again. */
export const Failed: Story = {
  args: { error: 'A Space called “Launch plan” already exists.' },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /already exists/,
    )
    await expect(
      within(dialog).getByRole('button', { name: 'Create Space' }),
    ).toBeEnabled()
  },
}

/** Long: a long brief stays inside the dialog, its actions in reach. */
export const Long: Story = {
  args: {
    brief: Array.from(
      { length: 20 },
      () =>
        'Purpose, constraints and useful background: the agents read this before every attempt in the Space.',
    ).join(' '),
  },
  play: async () => {
    const dialog = await openDialog()
    const box = dialog.getBoundingClientRect()
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
    await expect(
      within(dialog).getByRole('button', { name: 'Create Space' }),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * From a session (ruling 4): Session Space's "Create Space…" opens this
 * dialog with the session's name, and says the session becomes the seed.
 */
export const FromSession: Story = {
  name: 'From a session',
  args: { seeded: true, title: 'Refactor auth', brief: '' },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByLabelText('Title')).toHaveValue(
      'Refactor auth',
    )
    await expect(
      within(dialog).getByText(
        'Create a durable Chat context, with this session as its seed attempt.',
      ),
    ).toBeVisible()
  },
}

/** Reduced motion: the dialog arrives at once. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'New Space' })
    await expect(getComputedStyle(dialog).animationName).toBe('none')
  },
}
