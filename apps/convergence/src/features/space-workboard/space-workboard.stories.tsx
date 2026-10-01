import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { Space, SpaceArtifact } from '@/entities/space'
import {
  SpaceWorkboardDialog,
  type SpaceAttemptView,
  type SpaceSynthesisPreview,
} from './space-workboard.presentational'

const space = (
  fields: Pick<Space, 'id' | 'title'> & Partial<Space>,
): Space => ({
  status: 'implementing',
  attention: 'none',
  brief: '',
  memory: '',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-30T16:45:00.000Z',
  ...fields,
})

const ds4 = space({
  id: 'space-ds4',
  title: 'Design system sweep',
  attention: 'needs-you',
  brief:
    'Move every screen onto @convergence/ui parts and tokens. Stories first, as a safety net.',
})

const spaces: Space[] = [
  ds4,
  space({ id: 'space-loom', title: 'The Loom', status: 'reviewing' }),
  space({ id: 'space-door', title: 'The Door', status: 'parked' }),
]

const attempts: SpaceAttemptView[] = [
  {
    attempt: {
      id: 'attempt-dlg',
      spaceId: 'space-ds4',
      sessionId: 'session-dlg',
      role: 'implementation',
      isPrimary: true,
      createdAt: '2026-10-01T10:00:00.000Z',
    },
    sessionName: 'DS4 stories: dialogs and settings',
    projectName: 'convergence',
    branchName: 'ui/ds4-stories-dlg',
    workingDirectory: '/Users/marcin/Projects/convergence',
    providerId: 'claude-code',
    status: 'running',
    attention: 'none',
    missing: false,
  },
  {
    attempt: {
      id: 'attempt-review',
      spaceId: 'space-ds4',
      sessionId: 'session-review',
      role: 'review',
      isPrimary: false,
      createdAt: '2026-10-01T11:00:00.000Z',
    },
    sessionName: 'Review DS0',
    projectName: 'convergence',
    branchName: null,
    workingDirectory: null,
    providerId: 'codex',
    status: 'completed',
    attention: 'needs-you',
    missing: true,
  },
]

const artifacts: SpaceArtifact[] = [
  {
    id: 'artifact-pr',
    spaceId: 'space-ds4',
    kind: 'pull-request',
    label: 'PR #915',
    value: 'https://github.com/marckraw/convergence/pull/915',
    sourceSessionId: 'session-dlg',
    status: 'in-progress',
    createdAt: '2026-10-01T10:30:00.000Z',
    updatedAt: '2026-10-01T10:30:00.000Z',
  },
]

const synthesisPreview: SpaceSynthesisPreview = {
  brief:
    'Stories cover every dialog and settings part; the sweep can start on the primitives.',
  decisions: ['Stories assert roles, never class names.'],
  openQuestions: ['Do the menus need tokens of their own?'],
  nextAction: 'Merge PR #915, then start DS4 on the dialogs.',
  artifacts: [
    {
      id: 'synth-branch',
      kind: 'branch',
      label: 'ui/ds4-stories-dlg',
      value: 'ui/ds4-stories-dlg',
      sourceSessionId: 'session-dlg',
      status: 'ready',
    },
  ],
}

const openWorkboard = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'Spaces' })
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
  title: 'Features/SpaceWorkboard/SpaceWorkboardDialog',
  component: SpaceWorkboardDialog,
  args: {
    open: true,
    spaces,
    selectedSpace: ds4,
    selectedDraft: {
      title: ds4.title,
      status: ds4.status,
      attention: ds4.attention,
      brief: ds4.brief,
    },
    selectedAttempts: attempts,
    selectedArtifacts: artifacts,
    artifactSuggestions: [],
    synthesisPreview: null,
    artifactDraft: {
      kind: 'pull-request',
      label: '',
      value: '',
      status: 'planned',
      sourceSessionId: '',
    },
    artifactDialogOpen: false,
    createTitle: '',
    attemptCounts: { 'space-ds4': 2, 'space-loom': 4 },
    artifactCounts: { 'space-ds4': 1, 'space-loom': 3 },
    isLoading: false,
    isCreating: false,
    isSaving: false,
    isCreatingArtifact: false,
    isDiscoveringArtifacts: false,
    isSynthesizing: false,
    error: null,
    onOpenChange: fn(),
    onCreateTitleChange: fn(),
    onCreate: fn(),
    onSelectSpace: fn(),
    onDraftChange: fn(),
    onSave: fn(),
    onArtifactDraftChange: fn(),
    onArtifactDialogOpenChange: fn(),
    onCreateArtifact: fn(),
    onArtifactKindChange: fn(),
    onArtifactStatusChange: fn(),
    onArtifactSourceSessionChange: fn(),
    onArtifactLabelCommit: fn(),
    onArtifactValueCommit: fn(),
    onDeleteArtifact: fn(),
    onDiscoverArtifacts: fn(),
    onAcceptArtifactSuggestion: fn(),
    onDismissArtifactSuggestion: fn(),
    onSynthesize: fn(),
    onSynthesisBriefChange: fn(),
    onAcceptSynthesisBrief: fn(),
    onRejectSynthesisBrief: fn(),
    onAppendSynthesisNotes: fn(),
    onAcceptSynthesisArtifact: fn(),
    onDismissSynthesisPreview: fn(),
    onAttemptRoleChange: fn(),
    onSetPrimaryAttempt: fn(),
    onDetachAttempt: fn(),
  },
} satisfies Meta<typeof SpaceWorkboardDialog>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The Spaces on the left, the chosen one on the right: its title, status,
 * brief, Attempts and Artifacts. Save keeps the edits.
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openWorkboard()
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^The Loom/ }),
    )
    await expect(args.onSelectSpace).toHaveBeenCalledWith('space-loom')
    await userEvent.type(within(dialog).getByLabelText('Title'), '!')
    await expect(args.onDraftChange).toHaveBeenCalledWith({
      ...args.selectedDraft,
      title: 'Design system sweep!',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Detach Review DS0' }),
    )
    await expect(args.onDetachAttempt).toHaveBeenCalledWith('attempt-review')
    const primaries = within(dialog).getAllByRole('button', {
      name: 'Primary',
    })
    await expect(primaries[0]).toBeDisabled()
    await userEvent.click(primaries[1] as HTMLElement)
    await expect(args.onSetPrimaryAttempt).toHaveBeenCalledWith(
      'attempt-review',
    )
    await expect(
      within(dialog).getByRole('link', { name: 'Open Artifact PR #915' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/marckraw/convergence/pull/915',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove Artifact PR #915' }),
    )
    await expect(args.onDeleteArtifact).toHaveBeenCalledWith('artifact-pr')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await expect(args.onSave).toHaveBeenCalledOnce()
  },
}

/** A title typed: the + makes a new Space. */
export const Create: Story = {
  args: { createTitle: 'Release 1.0' },
  play: async ({ args, userEvent }) => {
    const dialog = await openWorkboard()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create Space' }),
    )
    await expect(args.onCreate).toHaveBeenCalledOnce()
  },
}

/**
 * Adding an Artifact opens a second dialog over the first, with its own
 * labelled fields and its own endings.
 */
export const AddArtifact: Story = {
  name: 'Add Artifact',
  args: {
    artifactDialogOpen: true,
    artifactDraft: {
      kind: 'pull-request',
      label: 'Public PR',
      value: 'https://github.com/marckraw/convergence/pull/916',
      status: 'planned',
      sourceSessionId: '',
    },
  },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', { name: 'Add Artifact' })
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    )
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'New Artifact label' }),
      's',
    )
    await expect(args.onArtifactDraftChange).toHaveBeenCalledWith({
      ...args.artifactDraft,
      label: 'Public PRs',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create Artifact' }),
    )
    await expect(args.onCreateArtifact).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await expect(args.onArtifactDialogOpenChange).toHaveBeenCalledWith(false)
  },
}

/** Adding an Artifact with nothing typed: Create waits. */
export const AddArtifactEmpty: Story = {
  name: 'Add Artifact, empty',
  args: { artifactDialogOpen: true },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Add Artifact' })
    await expect(
      within(dialog).getByRole('button', { name: 'Create Artifact' }),
    ).toBeDisabled()
  },
}

/**
 * Synthesis: a proposed brief to edit, accept or reject, notes to append,
 * and Artifacts to accept one by one.
 */
export const Synthesis: Story = {
  args: { synthesisPreview },
  play: async ({ args, userEvent }) => {
    const dialog = await openWorkboard()
    const suggested = within(dialog).getByRole('textbox', {
      name: 'Suggested Space brief',
    })
    await userEvent.type(suggested, '!')
    await expect(args.onSynthesisBriefChange).toHaveBeenCalled()
    const accepts = within(dialog).getAllByRole('button', { name: 'Accept' })
    await userEvent.click(accepts[0] as HTMLElement)
    await expect(args.onAcceptSynthesisBrief).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Reject' }),
    )
    await expect(args.onRejectSynthesisBrief).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Append to Space brief' }),
    )
    await expect(args.onAppendSynthesisNotes).toHaveBeenCalledOnce()
    await userEvent.click(accepts[1] as HTMLElement)
    await expect(args.onAcceptSynthesisArtifact).toHaveBeenCalledWith(
      'synth-branch',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Dismiss synthesis preview' }),
    )
    await expect(args.onDismissSynthesisPreview).toHaveBeenCalledOnce()
  },
}

/** Discovered Artifacts wait to be accepted or dismissed. */
export const Suggestions: Story = {
  args: {
    artifactSuggestions: [
      {
        id: 'suggest-branch',
        title: 'Branch ui/ds4-stories-dlg',
        description:
          'Found on the Attempt "DS4 stories: dialogs and settings".',
        artifact: {
          spaceId: 'space-ds4',
          kind: 'branch',
          label: 'ui/ds4-stories-dlg',
          value: 'ui/ds4-stories-dlg',
        },
      },
    ],
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openWorkboard()
    await userEvent.click(
      within(dialog).getByRole('button', {
        name: 'Dismiss Branch ui/ds4-stories-dlg',
      }),
    )
    await expect(args.onDismissArtifactSuggestion).toHaveBeenCalledWith(
      'suggest-branch',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Discover' }),
    )
    await expect(args.onDiscoverArtifacts).toHaveBeenCalledOnce()
  },
}

/** Busy: synthesizing, discovering and saving each say so and wait. */
export const Busy: Story = {
  args: { isSynthesizing: true, isDiscoveringArtifacts: true, isSaving: true },
  play: async () => {
    const dialog = await openWorkboard()
    await expect(
      within(dialog).getByRole('button', { name: 'Synthesize Space brief' }),
    ).toBeDisabled()
    await expect(
      within(dialog).getByRole('button', { name: 'Checking...' }),
    ).toBeDisabled()
    await expect(
      within(dialog).getByRole('button', { name: 'Saving...' }),
    ).toBeDisabled()
  },
}

/** Busy, loading: no Spaces read yet. */
export const Loading: Story = {
  name: 'Busy, loading',
  args: { spaces: [], selectedSpace: null, isLoading: true },
  play: async () => {
    const dialog = await openWorkboard()
    await expect(within(dialog).getByText('Loading Spaces...')).toBeVisible()
  },
}

/** Failed: the error sits above the footer. */
export const Failed: Story = {
  args: { error: 'Could not save the Space: the title is already used.' },
  play: async () => {
    const dialog = await openWorkboard()
    await expect(
      within(dialog).getByText(/the title is already used/),
    ).toBeVisible()
  },
}

/** Empty: no Spaces, nothing chosen, nothing to save. */
export const Empty: Story = {
  args: {
    spaces: [],
    selectedSpace: null,
    selectedAttempts: [],
    selectedArtifacts: [],
  },
  play: async () => {
    const dialog = await openWorkboard()
    await expect(within(dialog).getByText('No Spaces yet.')).toBeVisible()
    await expect(
      within(dialog).getByText('Select or create a Space.'),
    ).toBeVisible()
    await expect(
      within(dialog).getByRole('button', { name: 'Save' }),
    ).toBeDisabled()
    await expect(
      within(dialog).getByRole('button', { name: 'Create Space' }),
    ).toBeDisabled()
  },
}

/** A Space with no Attempts yet: nothing to synthesize or discover from. */
export const NoAttempts: Story = {
  name: 'No Attempts',
  args: { selectedAttempts: [], selectedArtifacts: [] },
  play: async () => {
    const dialog = await openWorkboard()
    await expect(
      within(dialog).getByText('No linked Attempts yet.'),
    ).toBeVisible()
    await expect(within(dialog).getByText('No Artifacts yet.')).toBeVisible()
    await expect(
      within(dialog).getByRole('button', { name: 'Synthesize Space brief' }),
    ).toBeDisabled()
  },
}

export const Dark: Story = {
  ...Synthesis,
  name: 'Dark',
  globals: { theme: 'dark' },
}
