import type { Meta, StoryObj } from '@storybook/react-vite'
import type { AttachmentDraftController } from '@/entities/attachment'
import { resolveProviderSelection, type ProviderInfo } from '@/entities/session'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { SessionForkDialog } from './session-fork.presentational'

const capabilities: Pick<ProviderInfo, 'attachments' | 'midRunInput'> = {
  attachments: {
    supportsImage: true,
    supportsPdf: true,
    supportsText: true,
    maxImageBytes: 10 * 1024 * 1024,
    maxPdfBytes: 20 * 1024 * 1024,
    maxTextBytes: 1024 * 1024,
    maxTotalBytes: 50 * 1024 * 1024,
  },
  midRunInput: {
    supportsAnswer: true,
    supportsNativeFollowUp: true,
    supportsAppQueuedFollowUp: true,
    supportsSteer: true,
    supportsInterrupt: true,
    defaultRunningMode: 'follow-up',
  },
}

const providers: ProviderInfo[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    kind: 'conversation',
    supportsContinuation: true,
    supportsConversationReset: true,
    defaultModelId: 'opus',
    modelOptions: [
      {
        id: 'opus',
        label: 'Claude Opus',
        defaultEffort: 'high',
        effortOptions: [
          { id: 'medium', label: 'Medium' },
          { id: 'high', label: 'High' },
        ],
      },
      {
        id: 'haiku',
        label: 'Claude Haiku',
        defaultEffort: 'low',
        effortOptions: [{ id: 'low', label: 'Low' }],
      },
    ],
    ...capabilities,
  },
]

const attachmentDraft: AttachmentDraftController = {
  attachments: [],
  rejections: [],
  ingestInFlight: false,
  isDragging: false,
  dragHandlers: {
    onDragEnter: fn(),
    onDragLeave: fn(),
    onDragOver: fn(),
    onDrop: fn(),
  },
  onPaste: fn(),
  openFileDialog: fn(async () => {}),
  ingestFiles: fn(async () => {}),
  removeOne: fn(),
  clearDraft: fn(),
}

const summarySeed = [
  '# Composer focus',
  '',
  '## Decisions',
  '- Return focus to the message field when any picker closes.',
  '',
  '## Next steps',
  '- Add a container test that closes the skill picker with Escape.',
].join('\n')

/** The dialog, once it has finished opening. */
const openedDialog = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'Fork session' })
  await waitFor(() => expect(dialog).toBeVisible())
  return dialog
}

const meta = {
  title: 'Features/SessionFork/SessionFork',
  component: SessionForkDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    parentName: 'Composer focus',
    name: 'Composer focus (fork)',
    strategy: 'full',
    summaryAllowed: true,
    summaryDisabledReason: null,
    providers,
    selection: resolveProviderSelection(
      providers,
      'claude-code',
      'opus',
      'high',
    ),
    summarizerSelection: resolveProviderSelection(
      providers,
      'claude-code',
      'haiku',
      'low',
    ),
    sizeWarning: null,
    workspaceMode: 'reuse',
    workspaceBranchName: '',
    additionalInstruction: '',
    seedMarkdown: '',
    preview: { status: 'idle' },
    progressLabel: null,
    attachmentDraft,
    previewAttachment: null,
    attachmentErrorByAttachmentId: {},
    attachmentsValid: true,
    isSubmitting: false,
    submitError: null,
    onNameChange: fn(),
    onStrategyChange: fn(),
    onProviderChange: fn(),
    onModelChange: fn(),
    onEffortChange: fn(),
    onSummarizerProviderChange: fn(),
    onSummarizerModelChange: fn(),
    onSummarizerEffortChange: fn(),
    onWorkspaceModeChange: fn(),
    onWorkspaceBranchNameChange: fn(),
    onAdditionalInstructionChange: fn(),
    onSeedMarkdownChange: fn(),
    onGenerateSummary: fn(),
    onAttachmentOpen: fn(),
    onPreviewClose: fn(),
    onConfirm: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof SessionForkDialog>

export default meta

type Story = StoryObj<typeof meta>

/** Fork with the full transcript into the same workspace. */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openedDialog()
    await waitFor(() =>
      expect(
        within(dialog).getByText(
          'Create a new session seeded from "Composer focus".',
        ),
      ).toBeVisible(),
    )
    await expect(within(dialog).getByLabelText('Name')).toHaveValue(
      'Composer focus (fork)',
    )
    await userEvent.click(
      within(dialog).getByRole('radio', { name: /Structured summary/ }),
    )
    await expect(args.onStrategyChange).toHaveBeenCalledWith('summary')
    await userEvent.click(
      within(dialog).getByRole('radio', { name: /New workspace/ }),
    )
    await expect(args.onWorkspaceModeChange).toHaveBeenCalledWith('fork')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create fork' }),
    )
    await expect(args.onConfirm).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await expect(args.onCancel).toHaveBeenCalledOnce()
  },
}

/** The full transcript is large for the provider's window: a warning, and a way out. */
export const SizeWarning: Story = {
  args: {
    sizeWarning: {
      estimatedTokens: 168_000,
      windowTokens: 200_000,
      percentage: 84,
    },
  },
  play: async ({ args, userEvent }) => {
    const warning = await screen.findByRole('alert')
    await expect(warning).toHaveTextContent('approximately 84%')
    await userEvent.click(
      within(warning).getByRole('button', { name: 'Switch to summary' }),
    )
    await expect(args.onStrategyChange).toHaveBeenCalledWith('summary')
  },
}

/** Summary chosen, nothing generated yet: Create waits for a seed. */
export const Summary: Story = {
  args: { strategy: 'summary' },
  play: async ({ args, userEvent }) => {
    const dialog = await openedDialog()
    // R2: Create stays reachable and says why it waits (DLG §4 13).
    const create = within(dialog).getByRole('button', { name: 'Create fork' })
    await expect(create).toHaveAttribute('aria-disabled', 'true')
    await expect(create).toHaveAccessibleDescription(
      'Generate the summary first.',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Generate summary' }),
    )
    await expect(args.onGenerateSummary).toHaveBeenCalledOnce()
  },
}

/** The summary is being written, and the provider has gone quiet. */
export const Busy: Story = {
  args: {
    strategy: 'summary',
    preview: { status: 'loading' },
    progressLabel: {
      primary: 'Extracting summary from parent transcript… 42s',
      secondary: 'Last output 34s ago',
      stale: true,
    },
  },
  play: async () => {
    await expect(
      await screen.findByText(
        'No output in the last 30s. The provider may be stuck.',
      ),
    ).toBeInTheDocument()
  },
}

/** The summary is ready to read and edit before forking. */
export const SummaryReady: Story = {
  name: 'Summary ready',
  args: {
    strategy: 'summary',
    seedMarkdown: summarySeed,
    preview: {
      status: 'ready',
      summary: {
        topic: 'Composer focus',
        decisions: [
          {
            text: 'Return focus to the message field when any picker closes.',
            evidence: 'turn 4',
          },
        ],
        open_questions: [],
        key_facts: [],
        artifacts: {
          urls: [],
          file_paths: [],
          repos: [],
          commands: [],
          identifiers: [],
        },
        next_steps: ['Add a container test.'],
      },
    },
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openedDialog()
    await expect(
      within(dialog).getByRole('button', { name: 'Create fork' }),
    ).toBeEnabled()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Regenerate' }),
    )
    await expect(args.onGenerateSummary).toHaveBeenCalledOnce()
  },
}

/** The summary failed: retry, or fall back to the full transcript. */
export const Failed: Story = {
  args: {
    strategy: 'summary',
    preview: {
      status: 'error',
      message: 'The summarizer returned no JSON after two attempts.',
    },
    submitError: null,
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openedDialog()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Switch to full transcript' }),
    )
    await expect(args.onStrategyChange).toHaveBeenCalledWith('full')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry' }))
    await expect(args.onGenerateSummary).toHaveBeenCalledOnce()
  },
}

/**
 * Creating the fork failed: what failed over the buttons, and why on the
 * line under it (R10, DLG-31).
 */
export const CreateFailed: Story = {
  name: 'Create failed',
  args: {
    submitError: { reason: 'The branch fork/composer-focus already exists.' },
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openedDialog()
    const alert = within(dialog).getByRole('alert')
    await expect(alert).toHaveTextContent('Couldn’t create the fork.')
    await expect(
      within(alert).getByText('The branch fork/composer-focus already exists.'),
    ).toBeVisible()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create fork' }),
    )
    await expect(args.onConfirm).toHaveBeenCalledOnce()
  },
}

/** A new workspace needs a branch name before Create. */
export const NewWorkspace: Story = {
  name: 'New workspace',
  args: { workspaceMode: 'fork', workspaceBranchName: '' },
  play: async ({ args, userEvent }) => {
    const dialog = await openedDialog()
    // R2: Create stays reachable and says why it waits (DLG §4 13).
    const create = within(dialog).getByRole('button', { name: 'Create fork' })
    await expect(create).toHaveAttribute('aria-disabled', 'true')
    await expect(create).toHaveAccessibleDescription(
      'Name the new branch first.',
    )
    await userEvent.type(
      within(dialog).getByPlaceholderText('fork/branch-name'),
      'f',
    )
    await expect(args.onWorkspaceBranchNameChange).toHaveBeenCalledWith('f')
  },
}

/** Forking: every control waits. */
export const Disabled: Story = {
  args: {
    isSubmitting: true,
    summaryAllowed: false,
    summaryDisabledReason: 'Needs at least 4 transcript entries.',
  },
  play: async () => {
    const dialog = await openedDialog()
    await expect(
      within(dialog).getByRole('button', { name: 'Forking…' }),
    ).toBeDisabled()
    await expect(
      within(dialog).getByRole('radio', { name: /Structured summary/ }),
    ).toHaveAttribute('aria-disabled', 'true')
    await expect(
      within(dialog).getByText('Needs at least 4 transcript entries.'),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const FailedDark: Story = {
  ...Failed,
  name: 'Failed, dark',
  globals: { theme: 'dark' },
}

export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async () => {
    const dialog = await openedDialog()
    await waitFor(() => expect(dialog).toBeVisible())
  },
}
