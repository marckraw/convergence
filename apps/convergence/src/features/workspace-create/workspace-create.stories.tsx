import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { ComboboxItem } from '@convergence/ui'
import {
  PROJECT_DEFAULT_ID,
  WorkspaceCreateDialog,
} from './workspace-create.presentational'

const baseBranchItems: ComboboxItem[] = [
  {
    id: PROJECT_DEFAULT_ID,
    label: 'Use project default',
    description: 'master',
  },
  { id: 'master', label: 'master' },
  { id: 'release/0.98', label: 'release/0.98' },
  { id: 'ui/ds0-package', label: 'ui/ds0-package' },
]

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'New workspace' })
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
  title: 'Features/WorkspaceCreate/WorkspaceCreateDialog',
  component: WorkspaceCreateDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    projectName: 'convergence',
    branchName: 'feature/stories',
    onBranchNameChange: fn(),
    baseBranchItems,
    selectedBaseBranchId: PROJECT_DEFAULT_ID,
    selectedBaseBranchLabel: 'Use project default',
    onBaseBranchChange: fn(),
    isLoadingBranches: false,
    isSubmitting: false,
    error: null,
    onSubmit: fn(),
  },
} satisfies Meta<typeof WorkspaceCreateDialog>

export default meta

type Story = StoryObj<typeof meta>

/** A branch name and the branch to create it from; Create submits. */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'Create a new git worktree for convergence.',
    )
    const branch = within(dialog).getByLabelText('Branch name')
    await expect(branch).toHaveFocus()
    await userEvent.type(branch, 's')
    await expect(args.onBranchNameChange).toHaveBeenCalledWith(
      'feature/storiess',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create workspace' }),
    )
    await expect(args.onSubmit).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** The base branch is a searchable list; choosing one reports its id. */
export const ChooseBaseBranch: Story = {
  name: 'Choose a base branch',
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'Create from' }),
    )
    const search = await screen.findByRole('combobox', {
      name: 'Search branches',
    })
    await userEvent.type(search, 'release')
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1))
    await userEvent.click(screen.getByRole('option', { name: /release\/0.98/ }))
    await expect(args.onBaseBranchChange).toHaveBeenCalledWith('release/0.98')
  },
}

/**
 * Busy, loading branches: only the project default is listed yet, and the
 * search says the rest are on their way. Escape closes the list, not the
 * dialog.
 */
export const LoadingBranches: Story = {
  name: 'Busy, loading branches',
  args: {
    baseBranchItems: baseBranchItems.slice(0, 1),
    isLoadingBranches: true,
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'Create from' }),
    )
    const search = await screen.findByRole('combobox', {
      name: 'Loading branches…',
    })
    await expect(screen.getAllByRole('option')).toHaveLength(1)
    // The list has settled with the focus in its search before Escape, as
    // a person's would (the list opens into a Base UI dialog since MAR-3616).
    await waitFor(() => expect(search).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    await expect(args.onOpenChange).not.toHaveBeenCalled()
  },
}

/** Empty: no branch name yet, so Create workspace waits and says why (R2). */
export const Empty: Story = {
  args: { branchName: '' },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    const create = within(dialog).getByRole('button', {
      name: 'Create workspace',
    })
    await expect(create).toHaveAttribute('aria-disabled', 'true')
    await expect(create).toHaveAccessibleDescription('Name the branch first.')
    await userEvent.type(
      within(dialog).getByLabelText('Branch name'),
      '{Enter}',
    )
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

/** Busy, creating: the field locks and, after a moment, the button says so. */
export const Busy: Story = {
  args: { isSubmitting: true },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'New workspace' })
    const create = within(dialog).getByRole('button', {
      name: 'Create workspace',
    })
    await waitFor(() => expect(create).toHaveAttribute('aria-busy', 'true'), {
      timeout: 1_000,
    })
    await expect(create).toHaveTextContent('Creating…')
    await expect(within(dialog).getByLabelText('Branch name')).toBeDisabled()
  },
}

/** Failed: git's refusal is announced above the footer. */
export const Failed: Story = {
  args: {
    error:
      "fatal: 'feature/stories' is already checked out at '/Users/marcin/Projects/convergence-lanes/stories'",
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /already checked out/,
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
