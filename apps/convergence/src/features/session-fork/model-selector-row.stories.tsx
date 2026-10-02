import type { Meta, StoryObj } from '@storybook/react-vite'
import { resolveProviderSelection, type ProviderInfo } from '@/entities/session'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { ModelSelectorRow } from './model-selector-row.presentational'

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
    id: 'pi',
    name: 'Pi',
    vendorLabel: 'Pi',
    kind: 'conversation',
    supportsContinuation: true,
    supportsConversationReset: false,
    defaultModelId: 'pi-default',
    modelOptions: [
      {
        id: 'pi-default',
        label: 'Default model',
        defaultEffort: null,
        effortOptions: [],
      },
    ],
    ...capabilities,
  },
]

const meta = {
  title: 'Features/SessionFork/ModelSelectorRow',
  component: ModelSelectorRow,
  args: {
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
  decorators: [
    (Story) => (
      <div className="flex flex-wrap items-center gap-1">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModelSelectorRow>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Provider, model and effort, side by side, each named by what it picks
 * (DLG-7): the provider and the effort are Selects of a few fixed choices
 * (R9, DLG-30), the model the model picker.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Provider' }),
    ).toHaveTextContent('Anthropic')
    await expect(
      canvas.getByRole('combobox', { name: 'Model' }),
    ).toHaveAccessibleDescription('Claude Opus')
    const effort = canvas.getByRole('combobox', { name: 'Reasoning effort' })
    await expect(effort).toHaveTextContent('High')
    await userEvent.click(effort)
    await userEvent.click(await screen.findByRole('option', { name: 'Medium' }))
    await expect(args.onEffortChange).toHaveBeenCalledWith('medium')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

/** A model with no effort levels: no effort control at all. */
export const Empty: Story = {
  args: {
    selection: resolveProviderSelection(providers, 'pi', 'pi-default', null),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole('combobox', { name: 'Reasoning effort' }),
    ).toBeNull()
    // The provider and the model, and nothing after them.
    await expect(canvas.getAllByRole('combobox')).toHaveLength(2)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
