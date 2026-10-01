import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { Button } from '@convergence/ui'
import { ProjectSettingsDialog } from './project-settings.presentational'

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', {
    name: 'Project Settings',
  })
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
  title: 'Features/ProjectSettings/ProjectSettingsDialog',
  component: ProjectSettingsDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    projectName: 'convergence',
    strategy: 'base-branch',
    baseBranchName: 'master',
    envCopyEnabled: true,
    envOverwrite: false,
    envPatternsText: '.env, .env.*',
    isSaving: false,
    error: null,
    onStrategyChange: fn(),
    onBaseBranchNameChange: fn(),
    onEnvCopyEnabledChange: fn(),
    onEnvOverwriteChange: fn(),
    onEnvPatternsTextChange: fn(),
    onSave: fn(),
    trigger: (
      <Button variant="ghost" size="sm">
        Project settings
      </Button>
    ),
  },
} satisfies Meta<typeof ProjectSettingsDialog>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Where new workspaces start, and which env files follow them. Save and
 * Cancel end it.
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'Configure how new workspaces branch for convergence.',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Current HEAD/ }),
    )
    await expect(args.onStrategyChange).toHaveBeenCalledWith('current-head')
    const base = within(dialog).getByLabelText('Base branch name')
    await expect(base).toBeEnabled()
    await userEvent.type(base, 's')
    await expect(args.onBaseBranchNameChange).toHaveBeenCalledWith('masters')
    await userEvent.click(
      within(dialog).getByRole('switch', {
        name: 'Overwrite existing env files',
      }),
    )
    await expect(args.onEnvOverwriteChange).toHaveBeenCalledWith(true)
    await userEvent.click(
      within(dialog).getByRole('switch', { name: 'Copy env files' }),
    )
    await expect(args.onEnvCopyEnabledChange).toHaveBeenCalledWith(false)
    await userEvent.type(within(dialog).getByLabelText('File patterns'), ',')
    await expect(args.onEnvPatternsTextChange).toHaveBeenCalledWith(
      '.env, .env.*,',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await expect(args.onSave).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/**
 * Disabled: starting from the current HEAD leaves no base branch to name, and
 * with env copying off its options wait too.
 */
export const Disabled: Story = {
  args: { strategy: 'current-head', envCopyEnabled: false },
  play: async () => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByLabelText('Base branch name'),
    ).toBeDisabled()
    await expect(
      within(dialog).getByRole('switch', { name: 'Copy env files' }),
    ).toHaveAttribute('aria-checked', 'false')
    await expect(
      within(dialog).getByRole('switch', {
        name: 'Overwrite existing env files',
      }),
    ).toBeDisabled()
    await expect(within(dialog).getByLabelText('File patterns')).toBeDisabled()
  },
}

/** Busy: saving locks every field and both buttons. */
export const Busy: Story = {
  args: { isSaving: true },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Project Settings',
    })
    await expect(
      within(dialog).getByRole('button', { name: 'Saving...' }),
    ).toBeDisabled()
    await expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled()
    await expect(
      within(dialog).getByLabelText('Base branch name'),
    ).toBeDisabled()
  },
}

/** Failed: the save's error sits under the fields. */
export const Failed: Story = {
  args: {
    error: 'Could not save the project settings: the database is locked.',
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByText(/the database is locked/),
    ).toBeVisible()
    await expect(
      within(dialog).getByRole('button', { name: 'Save' }),
    ).toBeEnabled()
  },
}

/** With the project's context items below, as the container passes them in. */
export const WithContextSection: Story = {
  name: 'With context section',
  args: {
    contextSection: (
      <div>
        <h3 className="text-sm font-medium">Context items</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Reusable text blocks that can be attached to sessions in this project.
        </p>
      </div>
    ),
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByRole('heading', { name: 'Context items' }),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
