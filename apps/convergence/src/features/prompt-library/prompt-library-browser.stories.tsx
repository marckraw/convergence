import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { Button } from '@convergence/ui'
import type {
  PromptLibraryCatalog,
  PromptLibraryDetails,
  PromptLibraryEntry,
} from '@/entities/prompt-library'
import {
  PromptLibraryBrowserDialog,
  type PromptLibraryFormDraft,
} from './prompt-library-browser.presentational'

const prompt = (
  fields: Pick<PromptLibraryEntry, 'id' | 'title' | 'scope'> &
    Partial<PromptLibraryEntry>,
): PromptLibraryEntry => ({
  description: '',
  shortDescription: null,
  path: `/Users/marcin/Projects/convergence/.convergence/prompts/${fields.id}.md`,
  relativePath: `.convergence/prompts/${fields.id}.md`,
  sourceLabel: fields.scope === 'project' ? 'convergence' : 'global',
  kind: 'markdown',
  tags: [],
  sizeBytes: 640,
  ...fields,
})

const prReview = prompt({
  id: 'pr-review',
  title: 'PR Review',
  scope: 'project',
  description: 'Review the open pull request for correctness and drift.',
  tags: ['review', 'github'],
})

const prompts: PromptLibraryEntry[] = [
  prReview,
  prompt({
    id: 'qa-checklist',
    title: 'QA checklist',
    scope: 'project',
    shortDescription: 'A focused checklist for the change, for Marcin’s eyes.',
    tags: ['qa'],
  }),
  prompt({
    id: 'standup',
    title: 'Standup notes',
    scope: 'global',
    kind: 'text',
    path: '/Users/marcin/.convergence/prompts/standup.txt',
    relativePath: 'standup.txt',
  }),
]

const catalog: PromptLibraryCatalog = {
  projectId: 'project-convergence',
  projectName: 'convergence',
  prompts,
  roots: [
    {
      scope: 'project',
      path: '/Users/marcin/Projects/convergence/.convergence/prompts',
      exists: true,
    },
    {
      scope: 'global',
      path: '/Users/marcin/.convergence/prompts',
      exists: true,
    },
  ],
  refreshedAt: '2026-10-01T12:00:00.000Z',
}

const details: PromptLibraryDetails = {
  promptId: 'pr-review',
  path: prReview.path,
  promptText:
    'Review the open pull request. Name each defect with its file and line, and say why it matters.',
  markdown:
    'Review the open pull request. Name each defect with its file and line, and say why it matters.',
  sizeBytes: 640,
}

const draft: PromptLibraryFormDraft = {
  mode: 'create',
  scope: 'project',
  kind: 'markdown',
  title: 'Release notes',
  description: 'Turn merged changesets into release notes.',
  tagsText: 'release, changesets',
  filename: '',
  promptText:
    'Write release notes for the merged changesets since the last tag.',
}

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'Prompt library' })
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
  title: 'Features/PromptLibrary/PromptLibraryBrowserDialog',
  component: PromptLibraryBrowserDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    trigger: <Button variant="ghost">Prompts</Button>,
    projectName: 'convergence',
    catalog,
    prompts,
    selectedPrompt: prReview,
    selectedDetails: details,
    isCatalogLoading: false,
    catalogError: null,
    isDetailsLoading: false,
    detailsError: null,
    filters: { query: '', scope: 'all', kind: 'all', tag: 'all' },
    tagOptions: ['github', 'qa', 'review'],
    totalPromptCount: 3,
    filteredPromptCount: 3,
    formDraft: null,
    formError: null,
    isMutating: false,
    onFiltersChange: fn(),
    onSelectPrompt: fn(),
    onRefresh: fn(),
    onStartCreate: fn(),
    onStartEdit: fn(),
    onCancelForm: fn(),
    onFormChange: fn(),
    onSubmitForm: fn(),
    onDeletePrompt: fn(),
  },
} satisfies Meta<typeof PromptLibraryBrowserDialog>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The prompts, filtered, beside the chosen one: its path, tags, text and
 * preview, with Edit and Delete.
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      '3/3 prompts in convergence.',
    )
    await expect(
      within(dialog).getByRole('heading', { name: 'PR Review' }),
    ).toBeVisible()
    await userEvent.type(
      within(dialog).getByRole('searchbox', { name: 'Search prompts' }),
      'q',
    )
    await expect(args.onFiltersChange).toHaveBeenCalledWith({ query: 'q' })
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Tag' }))
    await userEvent.click(await screen.findByRole('option', { name: 'qa' }))
    await expect(args.onFiltersChange).toHaveBeenCalledWith({ tag: 'qa' })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^QA checklist/ }),
    )
    await expect(args.onSelectPrompt).toHaveBeenCalledWith('qa-checklist')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit' }))
    await expect(args.onStartEdit).toHaveBeenCalledWith(prReview)
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete…' }),
    )
    await expect(args.onDeletePrompt).toHaveBeenCalledWith(prReview)
    await userEvent.click(within(dialog).getByRole('button', { name: 'New' }))
    await expect(args.onStartCreate).toHaveBeenCalledOnce()
    // Each change is kept as it is made: one Done ends it (R6).
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** Creating: the form's labelled fields, then Save or Cancel. */
export const Create: Story = {
  args: { formDraft: draft },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByRole('heading', { name: 'New prompt' }),
    ).toBeVisible()
    await userEvent.type(within(dialog).getByLabelText('Title'), 's')
    await expect(args.onFormChange).toHaveBeenCalledWith({
      title: 'Release notess',
    })
    await userEvent.type(within(dialog).getByLabelText('Filename'), 'r')
    await expect(args.onFormChange).toHaveBeenCalledWith({ filename: 'r' })
    // The list's Scope filter comes first; the form's Scope is the second.
    const [, formScope] = within(dialog).getAllByRole('combobox', {
      name: /Scope/,
    })
    await userEvent.click(formScope as HTMLElement)
    await userEvent.click(await screen.findByRole('option', { name: 'Global' }))
    await expect(args.onFormChange).toHaveBeenCalledWith({ scope: 'global' })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await expect(args.onSubmitForm).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await expect(args.onCancelForm).toHaveBeenCalledOnce()
  },
}

/** Editing: where the file lives and its kind are fixed, and no filename. */
export const Edit: Story = {
  args: {
    formDraft: {
      ...draft,
      mode: 'edit',
      title: 'PR Review',
      filename: 'pr-review.md',
    },
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByRole('heading', { name: 'Edit prompt' }),
    ).toBeVisible()
    // The list's Scope filter comes first; the form's Scope is the second.
    const [listScope, formScope] = within(dialog).getAllByRole('combobox', {
      name: /Scope/,
    })
    await expect(listScope).toBeEnabled()
    await expect(formScope).toBeDisabled()
    await expect(
      within(dialog).getByRole('combobox', { name: /File kind/ }),
    ).toBeDisabled()
    await expect(within(dialog).queryByLabelText('Filename')).toBeNull()
  },
}

/** Failed: the form's save failed, and the alert says why. */
export const Failed: Story = {
  args: {
    formDraft: draft,
    formError:
      'A prompt named release-notes.md already exists in this project.',
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /already exists/,
    )
  },
}

/** Busy: saving says so on Save, and locks Cancel and New, saying why (R2). */
export const Busy: Story = {
  args: { formDraft: draft, isMutating: true },
  play: async () => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByRole('button', { name: 'Saving…' }),
    ).toHaveAttribute('aria-busy', 'true')
    for (const name of ['Cancel', 'New']) {
      const button = within(dialog).getByRole('button', { name })
      await expect(button).toHaveAttribute('aria-disabled', 'true')
      await expect(button).toHaveAccessibleDescription(
        'Wait for the last change to save.',
      )
    }
  },
}

/** Busy, loading: the first read of the library and of the chosen prompt. */
export const Loading: Story = {
  name: 'Busy, loading',
  args: {
    catalog: null,
    prompts: [],
    selectedDetails: null,
    isCatalogLoading: true,
    isDetailsLoading: true,
  },
  play: async () => {
    const dialog = await openDialog()
    await waitFor(() =>
      expect(within(dialog).getByText('Loading prompts…')).toBeVisible(),
    )
    await waitFor(() =>
      expect(within(dialog).getByText('Loading the prompt…')).toBeVisible(),
    )
    await expect(
      within(dialog).getByRole('button', { name: 'Refresh' }),
    ).toHaveAttribute('aria-busy', 'true')
  },
}

/** Empty: no prompts yet, and a way to make the first. */
export const Empty: Story = {
  args: {
    catalog: { ...catalog, prompts: [] },
    prompts: [],
    selectedPrompt: null,
    selectedDetails: null,
    totalPromptCount: 0,
    filteredPromptCount: 0,
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(within(dialog).getByText('No prompts yet')).toBeVisible()
    await expect(within(dialog).getByText('No prompt selected')).toBeVisible()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'New prompt' }),
    )
    await expect(args.onStartCreate).toHaveBeenCalledOnce()
  },
}

/** Disabled: no project open. */
export const Disabled: Story = {
  args: { projectName: null, catalog: null, prompts: [], selectedPrompt: null },
  play: async () => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'Select a project to browse saved prompts.',
    )
    const create = within(dialog).getByRole('button', { name: 'New' })
    await expect(create).toHaveAttribute('aria-disabled', 'true')
    await expect(create).toHaveAccessibleDescription('Open a project first.')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
