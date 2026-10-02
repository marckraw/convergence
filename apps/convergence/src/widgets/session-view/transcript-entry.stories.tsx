import type { Meta, StoryObj } from '@storybook/react-vite'
import { metaText } from '@/shared/testing/meta-line'
import type { Attachment } from '@/entities/attachment'
import type { ConversationItem } from '@/entities/session'
import { expect, fn, waitFor, within } from 'storybook/test'
import { ConversationItemView } from './transcript-entry.presentational'
import { buildTranscriptEntryViewModel } from './transcript-entry.pure'

/*
 * One conversation item as the transcript draws it. The view models come from
 * the same builder the transcript uses, so a fixture is a stored item, not a
 * hand-written view model, and the times are pinned to one clock.
 */

const TURN_STARTED_AT = '2026-10-01T14:02:00.000Z'

/** What every stored item carries, whatever its kind. */
type ItemBase = Pick<
  ConversationItem,
  | 'id'
  | 'sessionId'
  | 'sequence'
  | 'turnId'
  | 'state'
  | 'createdAt'
  | 'updatedAt'
  | 'providerMeta'
>

type ItemOf<Kind extends ConversationItem['kind']> = Extract<
  ConversationItem,
  { kind: Kind }
>

const base = (
  id: string,
  createdAt: string,
  updatedAt = createdAt,
): ItemBase => ({
  id,
  sessionId: 'session-4f2c',
  sequence: 12,
  turnId: 'turn-4',
  state: 'complete',
  createdAt,
  updatedAt,
  providerMeta: {
    providerId: 'claude-code',
    providerItemId: null,
    providerEventType: null,
  },
})

const viewModelFor = (
  item: ConversationItem,
  options: {
    actionableApproval?: boolean
    actionableInput?: boolean
    injectedContextText?: string
    attachments?: Attachment[]
  } = {},
) =>
  buildTranscriptEntryViewModel({
    item,
    turnStartedAt: TURN_STARTED_AT,
    actionableApproval: options.actionableApproval,
    actionableInput: options.actionableInput,
    injectedContextText: options.injectedContextText,
    resolvedAttachmentsById: Object.fromEntries(
      (options.attachments ?? []).map((attachment) => [
        attachment.id,
        attachment,
      ]),
    ),
    timingOptions: {
      locale: 'en-GB',
      timeZone: 'UTC',
      now: '2026-10-01T15:00:00.000Z',
    },
  })

const assistantMessage: ItemOf<'message'> = {
  ...base(
    'item-assistant',
    '2026-10-01T14:02:31.000Z',
    '2026-10-01T14:02:44.000Z',
  ),
  kind: 'message',
  actor: 'assistant',
  text: [
    'The focus loss comes from the skill picker: on close it hands focus back to its trigger, which unmounted with the popover.',
    '',
    'The fix keeps the composer as the return target:',
    '',
    '```tsx',
    '<PopoverContent',
    '  onCloseAutoFocus={(event) => {',
    '    event.preventDefault()',
    '    textareaRef.current?.focus()',
    '  }}',
    '>',
    '```',
    '',
    'Typecheck and the composer tests pass.',
  ].join('\n'),
}

const meta = {
  title: 'Widgets/SessionView/TranscriptEntry',
  component: ConversationItemView,
  args: {
    viewModel: viewModelFor(assistantMessage),
    onApprove: fn(),
    onApproveSession: fn(),
    onDeny: fn(),
    onInputAnswer: fn(),
    onAttachmentOpen: fn(),
    onNoteAction: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-176 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConversationItemView>

export default meta

type Story = StoryObj<typeof meta>

/** The agent's answer: Markdown with a code block, and a copy button. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Agent')).toBeVisible()
    await expect(
      canvas.getByText(/The focus loss comes from the skill picker/),
    ).toBeVisible()
    await expect(canvas.getByText(/onCloseAutoFocus/)).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Copy' }),
    ).toBeInTheDocument()
    // When it started, how far into the turn, and how long it ran.
    await expect(canvas.getByText('Today, 14:02:31')).toBeVisible()
    await expect(canvas.getByText('+31s')).toBeVisible()
    await expect(canvas.getByText('13s')).toBeVisible()
  },
}

/** Still streaming: drawn the same, but not open to annotation yet. */
export const Busy: Story = {
  args: {
    viewModel: viewModelFor({
      ...assistantMessage,
      state: 'streaming',
      text: 'The focus loss comes from the skill picker: on close it hands focus',
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/on close it hands focus/)).toBeVisible()
  },
}

const attachments: Attachment[] = [
  {
    id: 'att-log',
    sessionId: 'session-4f2c',
    kind: 'text',
    mimeType: 'text/plain',
    filename: 'renderer-console.log',
    sizeBytes: 18_204,
    storagePath: '/tmp/attachments/renderer-console.log',
    thumbnailPath: null,
    textPreview: 'Warning: focus moved to <body>',
    createdAt: '2026-10-01T14:01:50.000Z',
  },
  {
    id: 'att-spec',
    sessionId: 'session-4f2c',
    kind: 'pdf',
    mimeType: 'application/pdf',
    filename: 'composer-focus-spec.pdf',
    sizeBytes: 220_400,
    storagePath: '/tmp/attachments/composer-focus-spec.pdf',
    thumbnailPath: null,
    textPreview: null,
    createdAt: '2026-10-01T14:01:52.000Z',
  },
]

const injectedContext =
  '<project-context>\nRepository: convergence\nBranch: fix/composer-focus\n</project-context>'

/**
 * Your message, sent as a steer while the agent ran, with a skill, injected
 * project context, two files and one that is gone.
 */
export const UserMessage: Story = {
  args: {
    viewModel: viewModelFor(
      {
        ...base('item-user', '2026-10-01T14:01:58.000Z'),
        kind: 'message',
        actor: 'user',
        deliveryMode: 'steer',
        text: `${injectedContext}\n\nThe composer loses focus after I close the skill picker. Can you find why?`,
        attachmentIds: ['att-log', 'att-spec', 'att-gone'],
        skillSelections: [
          {
            id: 'skill-diagnose',
            providerId: 'claude-code',
            name: 'diagnose',
            path: '/Users/me/.claude/skills/diagnose/SKILL.md',
            scope: 'user',
            rawScope: 'user',
            providerName: 'Claude Code',
            displayName: 'diagnose',
            sourceLabel: 'User',
            status: 'confirmed',
          },
        ],
      },
      { injectedContextText: injectedContext, attachments },
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('You')).toBeVisible()
    await expect(canvas.getByText('Steer')).toBeVisible()
    await expect(canvas.getByText('diagnose')).toBeVisible()
    await expect(
      canvas.getByText(/The composer loses focus after I close/),
    ).toBeVisible()
    // The injected context is folded away until asked for.
    const context = canvas.getByText(/Repository: convergence/)
    await expect(context).not.toBeVisible()
    await userEvent.click(canvas.getByText('Injected context'))
    await waitFor(() => expect(context).toBeVisible())
    await userEvent.click(
      canvas.getByRole('button', { name: /Preview renderer-console\.log/ }),
    )
    await expect(args.onAttachmentOpen).toHaveBeenCalledWith(attachments[0])
  },
}

/** The model's reasoning, quieter than its answer. */
export const Thinking: Story = {
  args: {
    viewModel: viewModelFor({
      ...base(
        'item-thinking',
        '2026-10-01T14:02:04.000Z',
        '2026-10-01T14:02:09.000Z',
      ),
      kind: 'thinking',
      actor: 'assistant',
      text: 'The popover restores focus to its trigger by default. If the trigger unmounts first, focus falls to the body.',
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Thinking')).toBeVisible()
  },
}

const toolCall: ItemOf<'tool-call'> = {
  ...base(
    'item-tool-call',
    '2026-10-01T14:02:12.000Z',
    '2026-10-01T14:02:14.000Z',
  ),
  kind: 'tool-call',
  toolName: 'Bash',
  inputText: JSON.stringify(
    {
      command:
        'npm run test:unit -w convergence -- src/features/composer/skill-picker.container.test.tsx',
      description: 'Run the skill picker tests',
    },
    null,
    2,
  ),
}

/** A tool call, folded to one line; opening it shows the whole input. */
export const ToolCall: Story = {
  args: { viewModel: viewModelFor(toolCall) },
  play: async ({ canvas, userEvent }) => {
    const summary = canvas.getByText(/^Bash: \{ "command": "npm run test:unit/)
    const input = canvas.getByText(
      /"description": "Run the skill picker tests"/,
    )
    await expect(input).not.toBeVisible()
    await userEvent.click(summary)
    await waitFor(() => expect(input).toBeVisible())
  },
}

/** A subagent's tool call says which agent made it. */
export const SubagentToolCall: Story = {
  args: {
    viewModel: viewModelFor({
      ...toolCall,
      id: 'item-subagent-call',
      agentRunId: 'run-7f3a',
      agentAttribution: {
        description: 'Audit the IPC handlers',
        agentType: 'general-purpose',
      },
    }),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('↳ Audit the IPC handlers (general-purpose)'),
    ).toBeVisible()
  },
}

/** A tool's output, folded like its call. */
export const ToolResult: Story = {
  args: {
    viewModel: viewModelFor({
      ...base(
        'item-tool-result',
        '2026-10-01T14:02:19.000Z',
        '2026-10-01T14:02:19.000Z',
      ),
      kind: 'tool-result',
      toolName: 'Bash',
      relatedItemId: 'item-tool-call',
      outputText: [
        ' RUN  v4.1.4 apps/convergence',
        '',
        ' ✓ src/features/composer/skill-picker.container.test.tsx (6 tests) 412ms',
        '',
        ' Test Files  1 passed (1)',
        '      Tests  6 passed (6)',
      ].join('\n'),
    }),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByText(/^RUN v4\.1\.4/, { selector: 'span' }),
    )
    const output = canvas.getByText(/Tests 6 passed \(6\)/, {
      selector: 'code',
    })
    await waitFor(() => expect(output).toBeVisible())
  },
}

/** A tool result recovered after the turn, marked as such. */
export const PostRunToolResult: Story = {
  args: {
    viewModel: viewModelFor({
      ...base('item-post-run', '2026-10-01T14:03:00.000Z'),
      providerMeta: {
        providerId: 'antigravity',
        providerItemId: 'traj-19',
        providerEventType: 'trajectory-tool-result',
      },
      kind: 'tool-result',
      toolName: 'view_file',
      relatedItemId: null,
      outputText: 'export function applyTheme(theme: Theme) { … }',
    }),
  },
  play: async ({ canvas }) => {
    const badge = canvas.getByTestId('tool-visibility-badge')
    await expect(badge).toHaveTextContent('Post-run')
    await expect(badge).toHaveAttribute(
      'data-tooltip',
      'Recovered from the Antigravity conversation database after the turn completed.',
    )
  },
}

/** A failing command's output. */
export const Failed: Story = {
  args: {
    viewModel: viewModelFor({
      ...base('item-tool-failed', '2026-10-01T14:02:40.000Z'),
      state: 'error',
      kind: 'tool-result',
      toolName: 'Bash',
      relatedItemId: 'item-tool-call',
      outputText: [
        'src/features/composer/composer.container.tsx(214,7): error TS2322:',
        "  Type 'string | null' is not assignable to type 'string'.",
        '',
        'Exit code 2',
      ].join('\n'),
    }),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByText(/error TS2322/, { selector: 'span' }),
    )
    const output = canvas.getByText(/Exit code 2/)
    await waitFor(() => expect(output).toBeVisible())
  },
}

const approvalRequest: ItemOf<'approval-request'> = {
  ...base('item-approval', '2026-10-01T14:02:50.000Z'),
  kind: 'approval-request',
  resolution: 'pending',
  description:
    'Claude wants to run `git push --force-with-lease origin fix/composer-focus`',
  permissionDetails: {
    blockedPath: 'git push',
    decisionReason: 'Not in the allow list for this project',
  },
  supportsSessionApproval: true,
}

/** The agent asks before running something; three ways to answer. */
export const ApprovalRequest: Story = {
  args: {
    viewModel: viewModelFor(approvalRequest, { actionableApproval: true }),
  },
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('group', { name: 'Approval needed' })
    await expect(
      within(card).getByText(
        metaText('git push · Not in the allow list for this project'),
      ),
    ).toBeVisible()
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }))
    await expect(args.onApprove).toHaveBeenCalledOnce()
    await userEvent.click(
      within(card).getByRole('button', {
        name: 'Always allow (this session)',
      }),
    )
    await expect(args.onApproveSession).toHaveBeenCalledOnce()
    await userEvent.click(within(card).getByRole('button', { name: 'Deny' }))
    await expect(args.onDeny).toHaveBeenCalledOnce()
  },
}

/** Answered: the card says how, and offers nothing more. */
export const ApprovalDenied: Story = {
  args: {
    viewModel: viewModelFor({ ...approvalRequest, resolution: 'denied' }),
  },
  play: async ({ canvas }) => {
    const card = canvas.getByRole('group', { name: 'Denied' })
    await expect(
      within(card).queryByRole('button', { name: 'Approve' }),
    ).toBeNull()
  },
}

/** The agent asks a multiple-choice question. */
export const ChoiceRequest: Story = {
  args: {
    viewModel: viewModelFor(
      {
        ...base('item-choice', '2026-10-01T14:03:10.000Z'),
        kind: 'input-request',
        resolution: 'pending',
        prompt: 'Two ways to keep focus in the composer.',
        request: {
          kind: 'choice',
          questions: [
            {
              id: 'q-fix',
              header: 'Fix',
              question: 'Which fix should I apply?',
              multiSelect: false,
              options: [
                {
                  label: 'Return focus to the composer',
                  description: 'Smallest change, one file.',
                },
                {
                  label: 'Keep the trigger mounted',
                  description: 'Touches the picker and its container.',
                },
              ],
            },
          ],
        },
      },
      { actionableInput: true },
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('group', { name: 'Input needed' })
    await userEvent.click(within(card).getByRole('button', { name: 'Answer' }))
    await expect(args.onInputAnswer).toHaveBeenCalledWith(
      {
        kind: 'choice',
        answers: [
          { questionId: 'q-fix', values: ['Return focus to the composer'] },
        ],
      },
      'Which fix should I apply?\nReturn focus to the composer',
    )
  },
}

/** The agent's plan, for approval before it edits anything. */
export const PlanRequest: Story = {
  args: {
    viewModel: viewModelFor(
      {
        ...base('item-plan', '2026-10-01T14:03:20.000Z'),
        kind: 'input-request',
        resolution: 'pending',
        prompt: 'Review the plan',
        request: {
          kind: 'plan',
          planPath: '.claude/plans/composer-focus.md',
          plan: [
            '## Plan',
            '',
            '1. Return focus to the composer when a picker closes.',
            '2. Add a container test that closes the picker with Escape.',
            '3. Run the composer tests and typecheck.',
          ].join('\n'),
          allowedPrompts: ['run tests', 'edit files in src/features/composer'],
        },
      },
      { actionableInput: true },
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('group', { name: 'Plan review needed' })
    await expect(
      within(card).getByText('.claude/plans/composer-focus.md'),
    ).toBeVisible()
    await userEvent.click(within(card).getByText('Requested prompts'))
    const prompt = within(card).getByText('run tests')
    await waitFor(() => expect(prompt).toBeVisible())
    await userEvent.click(
      within(card).getByRole('button', { name: 'Approve plan' }),
    )
    await expect(args.onInputAnswer).toHaveBeenCalledWith(
      { kind: 'plan', decision: 'approve' },
      'Approved plan',
    )
  },
}

/** An MCP server asks for values through a form. */
export const FormRequest: Story = {
  args: {
    viewModel: viewModelFor(
      {
        ...base('item-form', '2026-10-01T14:03:30.000Z'),
        kind: 'input-request',
        resolution: 'pending',
        prompt: 'Linear needs a few details',
        request: {
          kind: 'form',
          title: 'Create a Linear issue',
          message: 'The **linear** server needs these to file the follow-up.',
          fields: [
            {
              id: 'title',
              label: 'Title',
              type: 'string',
              required: true,
              defaultValue: 'Composer loses focus after closing a picker',
            },
          ],
        },
      },
      { actionableInput: true },
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('group', { name: 'Form input needed' })
    await expect(within(card).getByText('Create a Linear issue')).toBeVisible()
    await userEvent.click(within(card).getByRole('button', { name: 'Submit' }))
    await expect(args.onInputAnswer).toHaveBeenCalledWith(
      {
        kind: 'form',
        action: 'accept',
        values: { title: 'Composer loses focus after closing a picker' },
      },
      'Title\nComposer loses focus after closing a picker',
    )
  },
}

/** An MCP server asks to open a URL. */
export const UrlRequest: Story = {
  args: {
    viewModel: viewModelFor(
      {
        ...base('item-url', '2026-10-01T14:03:40.000Z'),
        kind: 'input-request',
        resolution: 'pending',
        prompt: 'Sign in',
        request: {
          kind: 'url',
          title: 'Sign in to Figma',
          message: 'The figma server needs you to authorize it.',
          url: 'https://www.figma.com/oauth?client_id=convergence&state=7d1c',
        },
      },
      { actionableInput: true },
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('group', { name: 'URL confirmation needed' })
    await expect(
      within(card).getByText(
        'https://www.figma.com/oauth?client_id=convergence&state=7d1c',
      ),
    ).toBeVisible()
    await userEvent.click(within(card).getByRole('button', { name: 'Decline' }))
    await expect(args.onInputAnswer).toHaveBeenCalledWith(
      { kind: 'url', action: 'decline' },
      'Declined URL request',
    )
  },
}

/** A note from the harness, with the one action it offers. */
export const Note: Story = {
  args: {
    viewModel: viewModelFor({
      ...base('item-note', '2026-10-01T14:04:00.000Z'),
      kind: 'note',
      level: 'warning',
      text: 'The **linear** MCP server needs sign-in for this account.',
      action: {
        kind: 'authorize-mcp-server',
        serverName: 'linear',
        providerAccountId: 'account-work',
      },
    }),
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Authorize for this account' }),
    )
    await expect(args.onNoteAction).toHaveBeenCalledWith({
      kind: 'authorize-mcp-server',
      serverName: 'linear',
      providerAccountId: 'account-work',
    })
  },
}

/** A restarted conversation is a boundary across the transcript. */
export const SessionRestarted: Story = {
  args: {
    viewModel: viewModelFor({
      ...base('item-restart', '2026-10-01T14:05:00.000Z'),
      providerMeta: {
        providerId: 'claude-code',
        providerItemId: null,
        providerEventType: 'session.restarted',
      },
      kind: 'note',
      level: 'warning',
      text: 'Conversation restarted — the model no longer remembers anything above this line.',
    }),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/Conversation restarted — the model no longer/),
    ).toBeVisible()
  },
}

/** A model change is the same kind of boundary: from here on, another model writes. */
export const ModelChanged: Story = {
  args: {
    viewModel: viewModelFor({
      ...base('item-model', '2026-10-01T14:06:00.000Z'),
      providerMeta: {
        providerId: 'claude-code',
        providerItemId: null,
        providerEventType: 'session.model-changed',
      },
      kind: 'note',
      level: 'info',
      text: 'Model changed: Opus → Sonnet',
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Model changed: Opus → Sonnet')).toBeVisible()
  },
}

/** A long answer with a list, a table and a long unbroken path. */
export const Long: Story = {
  args: {
    viewModel: viewModelFor({
      ...assistantMessage,
      id: 'item-long',
      text: [
        'Here is what changed across the three slices:',
        '',
        ...Array.from(
          { length: 12 },
          (_, index) =>
            `- \`apps/convergence/src/features/composer/part-${index + 1}.container.tsx\`: moved onto the shared Popover and kept the composer as the focus target.`,
        ),
        '',
        '| Gate | Result |',
        '| --- | --- |',
        '| typecheck | pass |',
        '| test:unit | 1,284 passed |',
        '| test:stories | 312 passed |',
        '',
        '/Users/marckraw/Projects/Private/convergence/.claude/worktrees/agent-ace62d03d1b065b41/apps/convergence/src/features/composer/composer.presentational.tsx',
      ].join('\n'),
    }),
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('table')).toBeVisible()
    // Nothing runs out of the transcript's column.
    await waitFor(() =>
      expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
        canvasElement.clientWidth,
      ),
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const ApprovalRequestDark: Story = {
  ...ApprovalRequest,
  name: 'Approval request, dark',
  globals: { theme: 'dark' },
}

export const UserMessageDark: Story = {
  ...UserMessage,
  name: 'User message, dark',
  globals: { theme: 'dark' },
}
