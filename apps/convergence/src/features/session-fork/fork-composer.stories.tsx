import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import type {
  Attachment,
  AttachmentDraftController,
} from '@/entities/attachment'
import { resolveProviderSelection, type ProviderInfo } from '@/entities/session'
import { expect, fn } from 'storybook/test'
import { ForkComposer } from './fork-composer.presentational'

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
        effortOptions: [{ id: 'high', label: 'High' }],
      },
    ],
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
  },
]

const attachment: Attachment = {
  id: 'att-log',
  sessionId: 'fork:session-4f2c',
  kind: 'text',
  mimeType: 'text/plain',
  filename: 'renderer-console.log',
  sizeBytes: 18_204,
  storagePath: '/tmp/attachments/renderer-console.log',
  thumbnailPath: null,
  textPreview: 'Warning: focus moved to <body>',
  createdAt: '2026-10-01T14:01:50.000Z',
}

const draft = (
  overrides: Partial<AttachmentDraftController> = {},
): AttachmentDraftController => ({
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
  ...overrides,
})

/** The editor with its text held the way the fork dialog holds it. */
function HeldComposer(props: ComponentProps<typeof ForkComposer>) {
  const [value, setValue] = useState(props.value)
  return (
    <ForkComposer
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
  title: 'Features/SessionFork/ForkComposer',
  component: ForkComposer,
  args: {
    textareaId: 'fork-instruction',
    value: '',
    onChange: fn(),
    attachmentDraft: draft(),
    onAttachmentOpen: fn(),
    providers,
    selection: resolveProviderSelection(
      providers,
      'claude-code',
      'opus',
      'high',
    ),
    onProviderChange: fn(),
    onModelChange: fn(),
    onEffortChange: fn(),
  },
  render: (args) => (
    <div className="w-144 max-w-full space-y-2">
      <label htmlFor="fork-instruction" className="text-sm font-medium">
        Additional instruction (optional)
      </label>
      <HeldComposer {...args} />
    </div>
  ),
} satisfies Meta<typeof ForkComposer>

export default meta

type Story = StoryObj<typeof meta>

/** What the fork should focus on, and which model runs it. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole('textbox', {
        name: 'Additional instruction (optional)',
      }),
      'Only the skill picker.',
    )
    await expect(args.onChange).toHaveBeenLastCalledWith(
      'Only the skill picker.',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Attach file' }))
    await expect(args.attachmentDraft.openFileDialog).toHaveBeenCalledOnce()
    await expect(
      canvas.getByRole('combobox', { name: 'Claude Opus' }),
    ).toBeVisible()
  },
}

/** A file attached to the seed. */
export const WithAttachment: Story = {
  args: { attachmentDraft: draft({ attachments: [attachment] }) },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', { name: 'Attach file' }),
    ).toHaveTextContent('1')
    await userEvent.click(
      canvas.getByRole('button', { name: /Preview renderer-console\.log/ }),
    )
    await expect(args.onAttachmentOpen).toHaveBeenCalledWith(attachment)
  },
}

/** Reading a dropped file: Attach waits. */
export const Busy: Story = {
  args: { attachmentDraft: draft({ ingestInFlight: true }) },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Attach file' }),
    ).toBeDisabled()
  },
}

/** While the fork is being created. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('textbox', {
        name: 'Additional instruction (optional)',
      }),
    ).toBeDisabled()
  },
}

export const Dark: Story = {
  ...WithAttachment,
  globals: { theme: 'dark' },
}
