import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { LaneCreateDialog } from './lane-create.presentational'

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'New lane' })
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
  title: 'Features/LaneCreate/LaneCreateDialog',
  component: LaneCreateDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    rootName: 'convergence',
    baseBranchLabel: 'origin/master, or the local master if origin has none',
    laneName: 'studio',
    onLaneNameChange: fn(),
    branchName: 'feat/studio-lane',
    onBranchNameChange: fn(),
    stage: { kind: 'form' },
    error: null,
    onSubmit: fn(),
    onSwitchToLane: fn(),
  },
} satisfies Meta<typeof LaneCreateDialog>

export default meta

type Story = StoryObj<typeof meta>

/** The form: a lane name, a branch, and the base it is cut from. */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'A copy of convergence with its own git and its own sessions, ignored files included.',
    )
    const lane = within(dialog).getByLabelText('Lane name')
    await expect(lane).toHaveFocus()
    await userEvent.type(lane, '-2')
    await expect(args.onLaneNameChange).toHaveBeenCalledWith('studio-')
    await userEvent.type(within(dialog).getByLabelText('Branch name'), 's')
    await expect(args.onBranchNameChange).toHaveBeenCalledWith(
      'feat/studio-lanes',
    )
    await expect(
      within(dialog).getByText(
        'origin/master, or the local master if origin has none',
      ),
    ).toBeVisible()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create lane' }),
    )
    await expect(args.onSubmit).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** Empty: Create lane waits for both names, and says which is missing (R2). */
export const Empty: Story = {
  args: { laneName: '', branchName: '' },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    const create = within(dialog).getByRole('button', { name: 'Create lane' })
    await expect(create).toHaveAttribute('aria-disabled', 'true')
    await expect(create).toHaveAccessibleDescription('Name the lane first.')
    await userEvent.type(within(dialog).getByLabelText('Lane name'), '{Enter}')
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

/**
 * Busy: the copy is running. Its phase is a status, the fields lock, and
 * neither Escape nor the ✕ can close the dialog until the copy has said what
 * happened.
 */
export const Busy: Story = {
  args: { stage: { kind: 'working', phase: 'copying' } },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Copying the project…',
    )
    const create = within(dialog).getByRole('button', { name: 'Create lane' })
    await waitFor(() => expect(create).toHaveAttribute('aria-busy', 'true'), {
      timeout: 1_000,
    })
    await expect(create).toHaveTextContent('Creating…')
    await expect(within(dialog).getByLabelText('Lane name')).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await expect(args.onOpenChange).not.toHaveBeenCalled()
  },
}

/** Failed: the error is announced above the footer, and the form can be sent again. */
export const Failed: Story = {
  args: {
    error:
      "A lane named 'studio' already exists at /Users/marcin/Projects/lanes/studio.",
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /A lane named 'studio' already exists/,
    )
    await expect(
      within(dialog).getByRole('button', { name: 'Create lane' }),
    ).toBeEnabled()
  },
}

/** Done: where the lane is, Switch to lane beside it, and the dialog ends in Done (R6). */
export const Done: Story = {
  args: {
    stage: {
      kind: 'done',
      lanePath: '/Users/marcin/Projects/lanes/studio',
      copyMethod: 'clonefile',
      warnings: [],
    },
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByText('/Users/marcin/Projects/lanes/studio'),
    ).toBeVisible()
    await expect(within(dialog).queryByLabelText('Lane name')).toBeNull()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Switch to lane' }),
    )
    await expect(args.onSwitchToLane).toHaveBeenCalledOnce()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** Done the slow way: copied byte by byte, with warnings to read. */
export const DoneWithWarnings: Story = {
  name: 'Done, with warnings',
  args: {
    stage: {
      kind: 'done',
      lanePath:
        '/Volumes/External/Projects/lanes/a-lane-with-a-rather-long-name-for-a-long-path/convergence',
      copyMethod: 'bytes',
      warnings: [
        'Could not copy .env.local: permission denied.',
        'node_modules/.cache was skipped: it is over 2 GB.',
      ],
    },
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByText(/byte-by-byte/)).toBeVisible()
    await expect(
      within(dialog).getByText('Could not copy .env.local: permission denied.'),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Dark, with the warnings' amber on the dark background. */
export const DoneDark: Story = {
  ...DoneWithWarnings,
  name: 'Done, with warnings, dark',
  globals: { theme: 'dark' },
}
