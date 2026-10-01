import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { resolveProviderSelection, type ProviderInfo } from '@/entities/session'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { SessionStartForm } from './session-start.presentational'

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
    ],
    ...capabilities,
  },
  {
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
        effortOptions: [{ id: 'medium', label: 'Medium' }],
      },
    ],
    ...capabilities,
  },
]

/** The form with its fields held the way the container holds them. */
function HeldForm(props: ComponentProps<typeof SessionStartForm>) {
  const [name, setName] = useState(props.name)
  const [message, setMessage] = useState(props.message)
  return (
    <SessionStartForm
      {...props}
      name={name}
      message={message}
      onNameChange={(next) => {
        setName(next)
        props.onNameChange(next)
      }}
      onMessageChange={(next) => {
        setMessage(next)
        props.onMessageChange(next)
      }}
    />
  )
}

const meta = {
  title: 'Features/SessionStart/SessionStart',
  component: SessionStartForm,
  args: {
    name: '',
    message: '',
    providers,
    selection: resolveProviderSelection(
      providers,
      'claude-code',
      'opus',
      'high',
    ),
    contextItems: [
      {
        id: 'ctx-arch',
        projectId: 'project-convergence',
        label: 'Architecture rules',
        body: 'FSD-lite layers, one-way imports.',
        reinjectMode: 'boot',
        createdAt: '2026-09-01T09:00:00.000Z',
        updatedAt: '2026-09-01T09:00:00.000Z',
      },
      {
        id: 'ctx-gates',
        projectId: 'project-convergence',
        label: 'Gates before a PR',
        body: 'Typecheck, tests and chaperone.',
        reinjectMode: 'every-turn',
        createdAt: '2026-09-02T09:00:00.000Z',
        updatedAt: '2026-09-02T09:00:00.000Z',
      },
    ],
    selectedContextIds: [],
    onNameChange: fn(),
    onMessageChange: fn(),
    onProviderChange: fn(),
    onModelChange: fn(),
    onEffortChange: fn(),
    onToggleContextItem: fn(),
    onSubmit: fn(),
  },
  render: (args) => <HeldForm {...args} />,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-[44rem] max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SessionStartForm>

export default meta

type Story = StoryObj<typeof meta>

/** Name the session, say what to do, and Start. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const start = canvas.getByRole('button', { name: 'Start' })
    await expect(start).toBeDisabled()
    await userEvent.type(
      canvas.getByPlaceholderText('Session name...'),
      'Composer focus',
    )
    await userEvent.type(
      canvas.getByPlaceholderText('Initial message for the agent...'),
      'Find why the composer loses focus.',
    )
    await expect(start).toBeEnabled()
    await userEvent.click(start)
    await expect(args.onSubmit).toHaveBeenCalledOnce()
  },
}

/** Project notes to inject at start, toggled like pressed buttons. */
export const WithContext: Story = {
  args: { selectedContextIds: ['ctx-gates'] },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', { name: 'Gates before a PR' }),
    ).toHaveAttribute('aria-pressed', 'true')
    const arch = canvas.getByRole('button', { name: 'Architecture rules' })
    await expect(arch).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(arch)
    await expect(args.onToggleContextItem).toHaveBeenCalledWith('ctx-arch')
    await expect(
      canvas.getByText('1 item will be injected at session start.'),
    ).toBeVisible()
  },
}

/** Choosing the provider. */
export const Provider: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Anthropic' }))
    await userEvent.click(await screen.findByRole('option', { name: /OpenAI/ }))
    await expect(args.onProviderChange).toHaveBeenCalledWith('codex')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

/** Without a name or a message there is nothing to start. */
export const Disabled: Story = {
  args: { name: 'Composer focus', message: '   ' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Start' })).toBeDisabled()
  },
}

/** No project notes: the picker is not drawn. */
export const Empty: Story = {
  args: { contextItems: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByText('Inject project context at session start'),
    ).toBeNull()
  },
}

export const Dark: Story = {
  ...WithContext,
  globals: { theme: 'dark' },
}
