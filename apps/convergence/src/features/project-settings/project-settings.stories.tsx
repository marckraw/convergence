import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { Button } from '@convergence/ui'
import { ProjectSettingsDialog } from './project-settings.presentational'

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', {
    name: 'Project settings',
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
    error: null,
    onStrategyChange: fn(),
    onBaseBranchNameChange: fn(),
    onEnvCopyEnabledChange: fn(),
    onEnvOverwriteChange: fn(),
    onEnvPatternsTextChange: fn(),
    trigger: <Button variant="ghost">Project settings</Button>,
  },
} satisfies Meta<typeof ProjectSettingsDialog>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Where new workspaces start, and which env files follow them. Each change is
 * kept as it is made, so one Done ends it (R6).
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'Configure how new workspaces branch for convergence.',
    )
    await expect(
      within(dialog).getByRole('radiogroup', {
        name: 'Workspace start point',
        // The group's hint is read with it (DLG-7).
        description:
          'This only affects new branches. Existing branches are checked out as-is.',
      }),
    ).toBeVisible()
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Current HEAD' }),
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
    await expect(
      within(dialog).queryByRole('button', { name: 'Save' }),
    ).toBeNull()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
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

/** Failed: the last save's error is announced over Done. */
export const Failed: Story = {
  args: {
    error: 'Couldn’t save the project settings. The database is locked.',
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /the database is locked/i,
    )
  },
}

/** With the project's context items below, as the container passes them in. */
export const WithContextSection: Story = {
  name: 'With context section',
  args: {
    contextSection: (
      <div>
        <h3 className="text-sm font-medium">Context items</h3>
        <p className="mt-1 text-xs text-ink-muted">
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
