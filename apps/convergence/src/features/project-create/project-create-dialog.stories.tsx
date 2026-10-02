import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { ProjectCreateDialog } from './project-create-dialog.presentational'

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'Open a project' })
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
  title: 'Features/ProjectCreate/ProjectCreateDialog',
  component: ProjectCreateDialog,
  args: {
    open: true,
    mode: 'local',
    remoteUrl: '',
    parentDirectory: '',
    directoryName: '',
    isOpeningLocal: false,
    isCloning: false,
    error: null,
    onOpenChange: fn(),
    onModeChange: fn(),
    onRemoteUrlChange: fn(),
    onDirectoryNameChange: fn(),
    onSelectParentDirectory: fn(),
    onOpenLocalProject: fn(),
    onCloneProject: fn(),
  },
} satisfies Meta<typeof ProjectCreateDialog>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A local folder: the footer's action opens the system's folder picker, and
 * where the project comes from is a segmented choice (R9).
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'Select a local repository or clone one from Git.',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Browse folders…' }),
    )
    await expect(args.onOpenLocalProject).toHaveBeenCalledOnce()
    await expect(
      within(dialog).getByRole('radio', { name: 'Local folder' }),
    ).toBeChecked()
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Clone URL' }),
    )
    await expect(args.onModeChange).toHaveBeenCalledWith('clone')
    await expect(
      within(dialog).queryByRole('button', { name: 'Clone project' }),
    ).toBeNull()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** Clone: three labelled fields; the footer's Clone project submits them. */
export const Clone: Story = {
  args: {
    mode: 'clone',
    remoteUrl: 'https://github.com/marckraw/convergence.git',
    parentDirectory: '/Users/marcin/Projects',
    directoryName: 'convergence',
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    const url = within(dialog).getByLabelText('Repository URL')
    await expect(url).toHaveValue('https://github.com/marckraw/convergence.git')
    await expect(within(dialog).getByLabelText('Destination')).toHaveValue(
      '/Users/marcin/Projects',
    )
    await userEvent.type(within(dialog).getByLabelText('Folder name'), '-2')
    await expect(args.onDirectoryNameChange).toHaveBeenCalledWith(
      'convergence-',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Browse' }),
    )
    await expect(args.onSelectParentDirectory).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Clone project' }),
    )
    await expect(args.onCloneProject).toHaveBeenCalledOnce()
  },
}

/** Disabled: Clone project waits until all three fields are filled. */
export const Disabled: Story = {
  args: {
    mode: 'clone',
    remoteUrl: 'https://github.com/marckraw/convergence.git',
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(within(dialog).getByLabelText('Repository URL')).toHaveFocus()
    const clone = within(dialog).getByRole('button', { name: 'Clone project' })
    await expect(clone).toHaveAttribute('aria-disabled', 'true')
    await expect(clone).toHaveAccessibleDescription(
      'Choose where to clone it first.',
    )
    await userEvent.type(
      within(dialog).getByLabelText('Repository URL'),
      '{Enter}',
    )
    await expect(args.onCloneProject).not.toHaveBeenCalled()
  },
}

/** Busy, cloning: the fields lock, and the button says what is happening. */
export const Busy: Story = {
  args: {
    mode: 'clone',
    remoteUrl: 'https://github.com/marckraw/convergence.git',
    parentDirectory: '/Users/marcin/Projects',
    directoryName: 'convergence',
    isCloning: true,
  },
  play: async () => {
    const dialog = await openDialog()
    const clone = within(dialog).getByRole('button', { name: 'Clone project' })
    await waitFor(() => expect(clone).toHaveAttribute('aria-busy', 'true'), {
      timeout: 1_000,
    })
    await expect(clone).toHaveTextContent('Cloning…')
    await expect(within(dialog).getByLabelText('Repository URL')).toBeDisabled()
  },
}

/** Busy, opening a local folder: its button says so and waits. */
export const BusyLocal: Story = {
  name: 'Busy, local',
  args: { isOpeningLocal: true },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Open a project' })
    const browse = within(dialog).getByRole('button', {
      name: 'Browse folders…',
    })
    await waitFor(() => expect(browse).toHaveAttribute('aria-busy', 'true'), {
      timeout: 1_000,
    })
    await expect(browse).toHaveTextContent('Opening…')
  },
}

/** Failed: the clone's error is announced above the footer. */
export const Failed: Story = {
  args: {
    mode: 'clone',
    remoteUrl: 'https://github.com/marckraw/not-a-repo.git',
    parentDirectory: '/Users/marcin/Projects',
    directoryName: 'not-a-repo',
    error:
      "Cloning failed: remote: Repository not found. fatal: repository 'https://github.com/marckraw/not-a-repo.git/' not found",
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /Repository not found/,
    )
    await expect(
      within(dialog).getByRole('button', { name: 'Clone project' }),
    ).toBeEnabled()
  },
}

export const Dark: Story = {
  ...Clone,
  globals: { theme: 'dark' },
}

/** Reduced motion: the dialog arrives at once. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Open a project' })
    await expect(getComputedStyle(dialog).animationName).toBe('none')
    await expect(dialog).toBeVisible()
  },
}
