import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import type { Attachment } from '@/entities/attachment'
import type { ProjectContextItem } from '@/entities/project-context'
import {
  resolveProviderSelection,
  type ProviderCatalogEntry,
  type ProviderInfo,
} from '@/entities/session'
import { expect, fn, within } from 'storybook/test'
import { Composer } from './composer.presentational'
import { filterComposerInjectionRootItems } from './composer-injection-trigger.pure'

/*
 * The composer as a conversation's footer draws it. Its text is controlled by
 * the container, so the stories hold it in state the same way.
 */

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

const claudeCode: ProviderInfo = {
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
      id: 'sonnet',
      label: 'Claude Sonnet',
      defaultEffort: 'medium',
      effortOptions: [{ id: 'medium', label: 'Medium' }],
    },
  ],
  ...capabilities,
}

const codex: ProviderInfo = {
  id: 'codex',
  name: 'Codex',
  vendorLabel: 'OpenAI',
  kind: 'conversation',
  supportsContinuation: true,
  supportsConversationReset: false,
  defaultModelId: 'gpt-5.4',
  modelOptions: [
    {
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      defaultEffort: 'medium',
      effortOptions: [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
      ],
    },
  ],
  ...capabilities,
}

const entries: ProviderCatalogEntry[] = [
  { descriptor: claudeCode, blockedReason: null },
  { descriptor: codex, blockedReason: null },
]

const attachment: Attachment = {
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
}

const contextItem: ProjectContextItem = {
  id: 'ctx-gates',
  projectId: 'project-convergence',
  label: 'Gates before a PR',
  body: 'npm run typecheck, test:pure, test:unit and chaperone check.',
  reinjectMode: 'every-turn',
  createdAt: '2026-09-02T09:00:00.000Z',
  updatedAt: '2026-09-02T09:00:00.000Z',
}

/** The composer with its text held the way the container holds it. */
function HeldComposer(props: ComponentProps<typeof Composer>) {
  const [value, setValue] = useState(props.value)
  return (
    <Composer
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next)
        props.onChange(next)
      }}
    />
  )
}

const meta = {
  title: 'Features/Composer/Composer',
  component: Composer,
  args: {
    value: '',
    onChange: fn(),
    onSubmit: fn(),
    optionRow: { status: 'listed', entries, notice: null },
    selection: resolveProviderSelection(
      [claudeCode, codex],
      'claude-code',
      'opus',
      'high',
    ),
    onProviderChange: fn(),
    onModelChange: fn(),
    onEffortChange: fn(),
    providerAccounts: [],
    selectedProviderAccountId: null,
    onProviderAccountChange: fn(),
    providerAccountSelectionLocked: false,
    providerAccountPickerVisible: false,
    codexSpeedChoices: [
      { id: 'default', label: 'Standard', description: null },
      { id: 'priority', label: 'Fast', description: 'Priority processing.' },
    ],
    codexSpeedId: 'default',
    onCodexSpeedChange: fn(),
    codexBillingControlsAvailable: false,
    executionBar: { mode: 'hidden', hostId: 'local' },
    onExecutionHostChange: fn(),
    workAddress: { mode: 'hidden' },
    onWorkAddressChange: fn(),
    onWorkAddressBranchChange: fn(),
    armedOutgoingRelays: 0,
    relaysMuted: false,
    onRelaysMutedChange: fn(),
    permissionConfig: { preset: 'ask' },
    permissionAdvancedOpen: false,
    onPermissionPresetChange: fn(),
    onPermissionAdvancedOpenChange: fn(),
    onCodexApprovalPolicyChange: fn(),
    onCodexSandboxChange: fn(),
    onClaudeCodePermissionModeChange: fn(),
    deliveryMode: 'normal',
    deliveryModes: ['normal'],
    onDeliveryModeChange: fn(),
    attachments: [],
    attachmentErrorByAttachmentId: {},
    hasAttachmentErrors: false,
    attachmentsIngestInFlight: false,
    isDragging: false,
    skillPickerOpen: false,
    skillQuery: '',
    skillOptions: [],
    selectedSkills: [],
    contextPickerOpen: false,
    projectContextItems: [contextItem],
    selectedContextItems: [],
    skillCatalogLoading: false,
    skillCatalogError: null,
    remoteSkillsNotice: null,
    onSkillPickerOpenChange: fn(),
    onSkillQueryChange: fn(),
    onSkillToggle: fn(),
    onSkillRemove: fn(),
    onContextPickerOpenChange: fn(),
    onContextToggle: fn(),
    onContextRemove: fn(),
    onAttachmentAdd: fn(),
    onSkillsBrowse: fn(),
    onAttachmentRemove: fn(),
    onAttachmentOpen: fn(),
    onDragEnter: fn(),
    onDragLeave: fn(),
    onDragOver: fn(),
    onDrop: fn(),
    onPaste: fn(),
  },
  render: (args) => <HeldComposer {...args} />,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-176 max-w-full pt-56">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Composer>

export default meta

type Story = StoryObj<typeof meta>

/** Type, then send with the button or ⌘↵. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const message = canvas.getByRole('textbox', { name: 'Message' })
    const send = canvas.getByRole('button', { name: 'Send message' })
    await expect(send).toBeDisabled()
    await userEvent.type(message, 'Why does the composer lose focus?')
    await expect(args.onChange).toHaveBeenLastCalledWith(
      'Why does the composer lose focus?',
    )
    await expect(send).toBeEnabled()
    await userEvent.click(send)
    await expect(args.onSubmit).toHaveBeenCalledOnce()
    message.focus()
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    await expect(args.onSubmit).toHaveBeenCalledTimes(2)
    // The provider, model and effort are named controls in the row.
    await expect(
      canvas.getByRole('combobox', { name: 'Anthropic' }),
    ).toBeVisible()
    await expect(canvas.getByRole('combobox', { name: 'High' })).toBeVisible()
  },
}

/** Nothing typed: neither the button nor ⌘↵ sends. */
export const Empty: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', { name: 'Send message' }),
    ).toBeDisabled()
    canvas.getByRole('textbox', { name: 'Message' }).focus()
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

/** A file, a skill and a context note ride along; each can be taken off. */
export const WithResources: Story = {
  args: {
    value: 'Here is the console log from the last run.',
    attachments: [attachment],
    selectedSkills: [
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
        status: 'selected',
      },
    ],
    selectedContextItems: [contextItem],
    everyTurnContextCount: 1,
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', { name: 'Add composer resources' }),
    ).toHaveTextContent('3')
    await expect(
      canvas.getByText('Every-turn context active · 1 item'),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove diagnose' }),
    )
    await expect(args.onSkillRemove).toHaveBeenCalledWith('skill-diagnose')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove Gates before a PR context' }),
    )
    await expect(args.onContextRemove).toHaveBeenCalledWith('ctx-gates')
  },
}

/** While a turn runs: follow up or steer, and send quiet past the wires. */
export const Busy: Story = {
  args: {
    value: 'Also check the skill picker.',
    deliveryMode: 'follow-up',
    deliveryModes: ['normal', 'follow-up', 'steer'],
    armedOutgoingRelays: 2,
    modelSelectionDisabled: true,
    selectionDisabled: true,
  },
  play: async ({ args, canvas, userEvent }) => {
    const modes = canvas.getByRole('radiogroup', { name: 'Delivery mode' })
    await expect(
      within(modes).getByRole('radio', { name: 'Follow-up' }),
    ).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(modes).getByRole('radio', { name: 'Steer' }))
    await expect(args.onDeliveryModeChange).toHaveBeenCalledWith('steer')
    // A Toggle: pressed, not a switch (DS-14).
    const quiet = canvas.getByRole('button', { name: 'Send quiet' })
    await expect(quiet).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(quiet)
    await expect(args.onRelaysMutedChange).toHaveBeenCalledWith(true)
  },
}

/** Codex: the speed, and the advanced permission controls opened. */
export const Codex: Story = {
  args: {
    selection: resolveProviderSelection(
      [claudeCode, codex],
      'codex',
      'gpt-5.4',
      'medium',
    ),
    codexBillingControlsAvailable: true,
    codexSpeedId: 'priority',
    permissionConfig: {
      preset: 'custom',
      codex: { approvalPolicy: 'on-request', sandbox: 'workspace-write' },
    },
    permissionAdvancedOpen: true,
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Speed: Fast' }),
    ).toBeVisible()
    const advanced = canvas.getByRole('button', {
      name: 'Advanced permission controls',
    })
    await expect(advanced).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(advanced)
    await expect(args.onPermissionAdvancedOpenChange).toHaveBeenCalledWith(
      false,
    )
  },
}

/** A remote machine that has not answered: no controls, and nothing can be sent. */
export const Remote: Story = {
  args: {
    value: 'Run the gates on grok-mac.',
    optionRow: {
      status: 'notice',
      notice: {
        kind: 'asking',
        text: 'Asking grok-mac which providers it runs…',
      },
    },
    executionBar: {
      mode: 'choosing',
      hostId: 'grok-mac',
      choices: [
        { id: 'local', label: 'Local' },
        { id: 'grok-mac', label: 'grok-mac' },
      ],
    },
    workAddress: { mode: 'asking', text: 'Asking grok-mac for its projects…' },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Asking grok-mac which providers it runs…'),
    ).toBeVisible()
    await expect(
      canvas.queryByRole('combobox', { name: 'Anthropic' }),
    ).toBeNull()
    await expect(
      canvas.getByRole('button', { name: 'Send message' }),
    ).toBeDisabled()
  },
}

/** An account switch was refused, so the message was not sent. */
export const Failed: Story = {
  args: {
    value: 'Continue on the work account.',
    accountNotice: {
      kind: 'refused',
      refusal: {
        accepted: false,
        stage: 'missing-thread',
        message:
          'The work account has no copy of this conversation to continue from.',
      },
    },
    onManageProviderAccounts: fn(),
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(/Not sent/)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Manage accounts…' }),
    )
    await expect(args.onManageProviderAccounts).toHaveBeenCalledOnce()
  },
}

/** Typing :: opens the injection picker; the keyboard walks and picks. */
export const Injection: Story = {
  args: {
    value: '::',
    rootInjectionPickerOpen: true,
    rootInjectionItems: filterComposerInjectionRootItems({
      query: '',
      includeContext: true,
      includePrompt: true,
      includeSkill: true,
    }),
    rootInjectionHighlightedIndex: 0,
    onRootInjectionSelect: fn(),
    onRootInjectionHover: fn(),
    onRootInjectionDismiss: fn(),
  },
  play: async ({ args, canvas, userEvent }) => {
    const message = canvas.getByRole('textbox', { name: 'Message' })
    await userEvent.click(message)
    // The message drives the picker's list: it names the list and the row the
    // arrows reach, so a screen reader hears it while the caret stays put.
    const list = canvas.getByRole('listbox', { name: 'Injections' })
    await expect(message).toHaveAttribute('aria-controls', list.id)
    await expect(message).toHaveAttribute(
      'aria-activedescendant',
      canvas.getAllByRole('option')[0].id,
    )
    await userEvent.keyboard('{ArrowDown}')
    await expect(args.onRootInjectionHover).toHaveBeenCalledWith(1)
    await userEvent.keyboard('{Enter}')
    await expect(args.onRootInjectionSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'context' }),
    )
    await userEvent.keyboard('{Escape}')
    await expect(args.onRootInjectionDismiss).toHaveBeenCalledOnce()
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

/** Off while the session cannot take input. */
export const Disabled: Story = {
  args: { value: 'Waiting…', disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('textbox', { name: 'Message' }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole('button', { name: 'Send message' }),
    ).toBeDisabled()
  },
}

/** A long message grows the field up to its cap. */
export const Long: Story = {
  args: {
    value: Array.from(
      { length: 20 },
      (_, line) =>
        `${line + 1}. Step ${line + 1} of the migration plan, with enough words to wrap.`,
    ).join('\n'),
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const BusyDark: Story = {
  ...Busy,
  name: 'Busy, dark',
  globals: { theme: 'dark' },
}
