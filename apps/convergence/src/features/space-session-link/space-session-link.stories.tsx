import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { Space } from '@/entities/space'
import { SpaceSessionLinkDialog } from './space-session-link.presentational'

const space = (id: string, title: string): Space => ({
  id,
  title,
  status: 'implementing',
  attention: 'none',
  brief: '',
  memory: '',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-30T10:00:00.000Z',
})

const spaces = [
  space('space-ds4', 'Design system sweep'),
  space('space-loom', 'The Loom'),
  space('space-door', 'The Door'),
]

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'Session Space' })
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
  title: 'Features/SpaceSessionLink/SpaceSessionLinkDialog',
  component: SpaceSessionLinkDialog,
  args: {
    open: true,
    sessionName: 'DS4 stories: dialogs, settings, menus and forms',
    spaces,
    linkedSpaces: [
      {
        attempt: {
          id: 'attempt-1',
          spaceId: 'space-ds4',
          sessionId: 'session-1',
          role: 'implementation',
          isPrimary: true,
          createdAt: '2026-10-01T10:00:00.000Z',
        },
        space: spaces[0] ?? null,
      },
    ],
    selectedSpaceId: 'space-loom',
    selectedRole: 'review',
    isLoading: false,
    isLinking: false,
    isDetaching: false,
    error: null,
    onOpenChange: fn(),
    onSelectedSpaceChange: fn(),
    onSelectedRoleChange: fn(),
    onCreateFromSession: fn(),
    onAttachToSpace: fn(),
    onDetachAttempt: fn(),
  },
} satisfies Meta<typeof SpaceSessionLinkDialog>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The session, a Space to make from it, one to attach it to with a role,
 * and the Spaces it is already in; Close ends it.
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    // A Space is made in the New Space dialog, not typed in here (ruling 4).
    await expect(
      within(dialog).queryByRole('textbox', {
        name: 'Space title from session',
      }),
    ).toBeNull()

    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'Attempt role' }),
    )
    await userEvent.click(
      await screen.findByRole('option', { name: 'Hardening' }),
    )
    await expect(args.onSelectedRoleChange).toHaveBeenCalledWith('hardening')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Attach' }),
    )
    await expect(args.onAttachToSpace).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Detach' }),
    )
    await expect(args.onDetachAttempt).toHaveBeenCalledWith(
      'attempt-1',
      'space-ds4',
    )
    // Each change is kept as it is made, so it ends in Done (R6).
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** The Space list leaves out the Spaces this session is already in. */
export const ChooseSpace: Story = {
  name: 'Choose a Space',
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'Existing Space' }),
    )
    await screen.findByRole('listbox')
    await expect(
      screen.queryByRole('option', { name: 'Design system sweep' }),
    ).toBeNull()
    await userEvent.click(screen.getByRole('option', { name: 'The Door' }))
    await expect(args.onSelectedSpaceChange).toHaveBeenCalledWith('space-door')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

/** Create Space… opens the New Space dialog, starting from this session (ruling 4). */
export const Create: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create Space…' }),
    )
    await expect(args.onCreateFromSession).toHaveBeenCalledOnce()
  },
}

/** Empty: not in any Space, and nothing chosen to attach to. */
export const Empty: Story = {
  args: { linkedSpaces: [], selectedSpaceId: '' },
  play: async () => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByText('This session is not linked to a Space.'),
    ).toBeVisible()
    await expect(
      within(dialog).getByRole('button', { name: 'Attach' }),
    ).toBeDisabled()
  },
}

/** Disabled: every Space already holds this session, so none can be attached. */
export const Disabled: Story = {
  args: {
    spaces: spaces.slice(0, 1),
    selectedSpaceId: '',
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByRole('combobox', { name: 'Existing Space' }),
    ).toBeDisabled()
    await expect(
      within(dialog).getByRole('combobox', { name: 'Existing Space' }),
    ).toHaveTextContent('No linkable Spaces')
  },
}

/** Busy: loading the links, attaching, and detaching all wait. */
export const Busy: Story = {
  args: {
    linkedSpaces: [],
    isLoading: true,
    isLinking: true,
  },
  play: async () => {
    const dialog = await openDialog()
    await waitFor(() =>
      expect(within(dialog).getByText('Loading linked Spaces…')).toBeVisible(),
    )
    await expect(
      within(dialog).getByRole('button', { name: 'Attach' }),
    ).toBeDisabled()
  },
}

/** Failed: the error is announced above the footer. */
export const Failed: Story = {
  args: { error: "Couldn't link the session: the Space was archived." },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /the Space was archived/,
    )
  },
}

export const Dark: Story = {
  ...Create,
  name: 'Dark',
  globals: { theme: 'dark' },
}
