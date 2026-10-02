import type { Meta, StoryObj } from '@storybook/react-vite'
import type { SessionSummary } from '@/entities/session'
import type { Space, SpaceArtifact } from '@/entities/space'
import { expect, fn, screen, waitFor } from 'storybook/test'
import {
  SpaceHome,
  type SpaceArtifactDraft,
  type SpaceHomeAttemptView,
} from './space-home.presentational'

const session = (
  overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id' | 'name'>,
): SessionSummary => ({
  contextKind: 'project',
  projectId: 'project-convergence',
  workspaceId: null,
  providerId: 'claude-code',
  model: 'claude-opus-4-1',
  effort: 'high',
  status: 'completed',
  attention: 'finished',
  activity: null,
  contextWindow: null,
  workingDirectory: '/Users/me/Projects/convergence',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 120,
  createdAt: '2026-09-28T09:10:00.000Z',
  updatedAt: '2026-10-01T14:00:00.000Z',
  ...overrides,
})

const space: Space = {
  id: 'space-ds',
  title: 'Design system sweep',
  status: 'implementing',
  attention: 'none',
  brief:
    'Move every screen onto @convergence/ui parts and tokens. Stories first, so each part proves it renders in both themes before and after.',
  memory: '',
  createdAt: '2026-09-28T09:00:00.000Z',
  updatedAt: '2026-10-01T14:00:00.000Z',
}

const attempts: SpaceHomeAttemptView[] = [
  {
    attempt: {
      id: 'attempt-1',
      spaceId: 'space-ds',
      sessionId: 'session-ds0',
      role: 'implementation',
      isPrimary: true,
      createdAt: '2026-09-28T09:10:00.000Z',
    },
    session: session({
      id: 'session-ds0',
      name: 'DS0 · the package',
      status: 'running',
      attention: 'none',
      activity: 'streaming',
    }),
  },
  {
    attempt: {
      id: 'attempt-2',
      spaceId: 'space-ds',
      sessionId: 'session-review',
      role: 'review',
      isPrimary: false,
      createdAt: '2026-09-29T11:00:00.000Z',
    },
    session: session({
      id: 'session-review',
      name: 'Independent review',
      providerId: 'codex',
    }),
  },
  {
    attempt: {
      id: 'attempt-3',
      spaceId: 'space-ds',
      sessionId: 'session-gone',
      role: 'exploration',
      isPrimary: false,
      createdAt: '2026-09-27T08:00:00.000Z',
    },
    session: null,
  },
]

const artifacts: SpaceArtifact[] = [
  {
    id: 'artifact-915',
    spaceId: 'space-ds',
    kind: 'pull-request',
    label: '#915 The design system is its own package',
    value: 'https://github.com/marckraw/convergence/pull/915',
    sourceSessionId: 'session-ds0',
    status: 'in-progress',
    createdAt: '2026-09-30T09:00:00.000Z',
    updatedAt: '2026-10-01T14:00:00.000Z',
  },
]

const emptyDraft: SpaceArtifactDraft = {
  kind: 'other',
  label: '',
  value: '',
  sourceSessionId: '',
  status: 'planned',
}

const meta = {
  title: 'Widgets/ChatSurface/SpaceHome',
  component: SpaceHome,
  args: {
    space,
    attempts,
    artifacts,
    sources: [
      {
        id: 'source-1',
        spaceId: 'space-ds',
        filename: 'design-system-drift.md',
        originalPath: '/Users/me/notes/design-system-drift.md',
        storagePath:
          '/Users/me/Library/Application Support/Convergence/spaces/space-ds/design-system-drift.md',
        sizeBytes: 18_400,
        createdAt: '2026-09-28T10:00:00.000Z',
      },
    ],
    activeTab: 'chats',
    artifactDraft: emptyDraft,
    editingArtifactId: null,
    briefDraft: space.brief,
    memoryDraft: '',
    onTabChange: fn(),
    onBeginAttempt: fn(),
    onOpenAttempt: fn(),
    onAddSources: fn(),
    onDeleteSource: fn(),
    onArchiveSpace: fn(),
    onUnarchiveSpace: fn(),
    onDeleteSpace: fn(),
    onBriefDraftChange: fn(),
    onMemoryDraftChange: fn(),
    onSaveBrief: fn(),
    onSaveMemory: fn(),
    onArtifactDraftChange: fn(),
    onSubmitArtifact: fn(),
    onCancelArtifactEdit: fn(),
    onEditArtifact: fn(),
    onDeleteArtifact: fn(),
    onAddArtifactFiles: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-176 bg-canvas">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpaceHome>

export default meta

type Story = StoryObj<typeof meta>

/** A Space's home on its chats: the attempts, and a way to start another. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Design system sweep' }),
    ).toBeVisible()
    await expect(canvas.getByRole('tab', { name: 'Chats' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: /Independent review/ }),
    )
    await expect(args.onOpenAttempt).toHaveBeenCalledWith('session-review')
    // An attempt whose session is gone cannot be opened.
    await expect(
      canvas.getByRole('button', { name: /Unknown session/ }),
    ).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'New chat' }))
    await expect(args.onBeginAttempt).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('tab', { name: 'Sources' }))
    await expect(args.onTabChange).toHaveBeenCalledWith('sources')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Archive Space…' }),
    )
    await expect(args.onArchiveSpace).toHaveBeenCalledOnce()
  },
}

/** No chats yet. */
export const Empty: Story = {
  args: { attempts: [], space: { ...space, brief: '' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No attempts yet')).toBeVisible()
    await expect(canvas.getByText('No Space brief yet.')).toBeVisible()
  },
}

/** The files kept with the Space. */
export const Sources: Story = {
  args: { activeTab: 'sources' },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('18 KB')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Remove source design-system-drift.md',
      }),
    )
    await expect(args.onDeleteSource).toHaveBeenCalledWith('source-1')
    await userEvent.click(canvas.getByRole('button', { name: 'Add source' }))
    await expect(args.onAddSources).toHaveBeenCalledOnce()
  },
}

/** Durable guidance for later attempts. */
export const Memory: Story = {
  args: { activeTab: 'memory' },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Space memory and instructions' }),
      'R',
    )
    await expect(args.onMemoryDraftChange).toHaveBeenCalledWith('R')
    await userEvent.click(canvas.getByRole('button', { name: 'Save memory' }))
    await expect(args.onSaveMemory).toHaveBeenCalledOnce()
  },
}

/** Outputs worth keeping, and the form that adds one. */
export const Artifacts: Story = {
  args: {
    activeTab: 'artifacts',
    artifactDraft: {
      ...emptyDraft,
      label: 'Drift checks',
      value: 'docs/checks/design-system-drift.md',
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('From DS0 · the package')).toBeVisible()
    await userEvent.click(canvas.getByRole('combobox', { name: 'Kind' }))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Documentation' }),
    )
    await expect(args.onArtifactDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'documentation' }),
    )
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    await userEvent.click(canvas.getByRole('button', { name: 'Add artifact' }))
    await expect(args.onSubmitArtifact).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Edit artifact #915 The design system is its own package',
      }),
    )
    await expect(args.onEditArtifact).toHaveBeenCalledWith(artifacts[0])
  },
}

/** Nothing to add yet: the form's action waits for a label and a value. */
export const Disabled: Story = {
  args: { activeTab: 'artifacts', artifacts: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Add artifact' }),
    ).toBeDisabled()
    await expect(canvas.getByText('No artifacts yet')).toBeVisible()
  },
}

/** Editing an artifact: Save and Cancel. */
export const EditingArtifact: Story = {
  args: {
    activeTab: 'artifacts',
    editingArtifactId: 'artifact-915',
    artifactDraft: {
      kind: 'pull-request',
      label: artifacts[0].label,
      value: artifacts[0].value,
      sourceSessionId: 'session-ds0',
      status: 'in-progress',
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Edit artifact' }),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }))
    await expect(args.onCancelArtifactEdit).toHaveBeenCalledOnce()
  },
}

/** The brief, edited in place. */
export const Brief: Story = {
  args: { activeTab: 'brief' },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('textbox', { name: 'Space brief' }),
    ).toHaveValue(space.brief)
    await userEvent.click(canvas.getByRole('button', { name: 'Save brief' }))
    await expect(args.onSaveBrief).toHaveBeenCalledOnce()
  },
}

/** An archived Space offers to come back. */
export const Archived: Story = {
  args: { space: { ...space, archivedAt: '2026-10-01T12:00:00.000Z' } },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Unarchive Space' }),
    )
    await expect(args.onUnarchiveSpace).toHaveBeenCalledOnce()
  },
}

/** A long title and brief, and many attempts. */
export const Long: Story = {
  args: {
    space: {
      ...space,
      title:
        'Design system sweep across the conversation, Mission Control, the settings dialogs and every remaining popover',
      brief: Array.from(
        { length: 6 },
        (_, index) =>
          `${index + 1}. Move slice ${index + 1} onto the shared parts and tokens, then run its stories in light, dark and reduced motion before calling it done.`,
      ).join('\n'),
    },
    attempts: Array.from({ length: 12 }, (_, index) => ({
      attempt: {
        ...attempts[1].attempt,
        id: `attempt-${index}`,
        sessionId: `session-${index}`,
      },
      session: session({
        id: `session-${index}`,
        name: `Stories for slice ${index + 1}: every presentational part with light, dark and reduced motion`,
      }),
    })),
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const ArtifactsDark: Story = {
  ...Artifacts,
  name: 'Artifacts, dark',
  globals: { theme: 'dark' },
}
