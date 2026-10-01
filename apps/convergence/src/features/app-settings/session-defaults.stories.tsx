import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type {
  ProviderInfo,
  ProviderModelOption,
  ResolvedProviderSelection,
} from '@/entities/session'
import { TooltipProvider } from '@convergence/ui'
import { SessionDefaultsFields } from './session-defaults.presentational'

const opus: ProviderModelOption = {
  id: 'claude-opus-5-5',
  label: 'Claude Opus 5.5',
  description: 'The most capable model for long agentic work.',
  defaultEffort: 'high',
  effortOptions: [
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High', description: 'Thinks longer before acting.' },
    { id: 'max', label: 'Max' },
  ],
}

const sonnet: ProviderModelOption = {
  id: 'claude-sonnet-5',
  label: 'Claude Sonnet 5',
  defaultEffort: null,
  effortOptions: [],
}

/** A conversation provider as the main process reports it. */
const provider = (
  fields: Pick<
    ProviderInfo,
    'id' | 'name' | 'vendorLabel' | 'defaultModelId' | 'modelOptions'
  > &
    Partial<ProviderInfo>,
): ProviderInfo => ({
  kind: 'conversation',
  supportsContinuation: true,
  supportsConversationReset: true,
  attachments: {
    supportsImage: true,
    supportsPdf: true,
    supportsText: true,
    maxImageBytes: 5_000_000,
    maxPdfBytes: 10_000_000,
    maxTextBytes: 1_000_000,
    maxTotalBytes: 20_000_000,
  },
  midRunInput: {
    supportsAnswer: true,
    supportsNativeFollowUp: true,
    supportsAppQueuedFollowUp: true,
    supportsSteer: true,
    supportsInterrupt: true,
    defaultRunningMode: 'steer',
  },
  ...fields,
})

const claude = provider({
  id: 'claude-code',
  name: 'Claude Code',
  vendorLabel: 'Anthropic',
  defaultModelId: 'claude-opus-5-5',
  modelOptions: [opus, sonnet],
  telemetry: {
    contextWindow: { availability: 'available', source: 'provider' },
    quota: { availability: 'available', source: 'provider-api' },
  },
})

const providers: ProviderInfo[] = [
  claude,
  provider({
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    defaultModelId: 'gpt-5.5',
    modelOptions: [
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        defaultEffort: 'medium',
        effortOptions: [{ id: 'medium', label: 'Medium' }],
      },
    ],
  }),
  provider({
    id: 'antigravity',
    name: 'Antigravity',
    vendorLabel: 'Google',
    defaultModelId: 'gemini-3-pro',
    modelOptions: [
      {
        id: 'gemini-3-pro',
        label: 'Gemini 3 Pro',
        defaultEffort: null,
        effortOptions: [],
      },
    ],
  }),
]

const selection: ResolvedProviderSelection = {
  provider: claude,
  providerId: 'claude-code',
  providerLabel: 'Anthropic',
  model: opus,
  modelId: 'claude-opus-5-5',
  effort: opus.effortOptions[2] ?? null,
  effortId: 'high',
}

const meta = {
  title: 'Features/AppSettings/SessionDefaults',
  component: SessionDefaultsFields,
  args: {
    providers,
    selection,
    onProviderChange: fn(),
    onModelChange: fn(),
    onEffortChange: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="w-xl">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof SessionDefaultsFields>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The default provider and reasoning effort, each a few fixed choices in a
 * Select (R9), the model in its picker, and below them what the provider
 * reports about itself.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const provider = canvas.getByRole('combobox', { name: 'Default provider' })
    await expect(provider).toHaveTextContent('Anthropic')
    await userEvent.click(provider)
    await userEvent.click(await screen.findByRole('option', { name: /OpenAI/ }))
    await expect(args.onProviderChange).toHaveBeenCalledWith('codex')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())

    const effort = canvas.getByRole('combobox', {
      name: 'Default reasoning effort',
    })
    await expect(effort).toHaveTextContent('High')
    await userEvent.click(effort)
    await userEvent.click(await screen.findByRole('option', { name: 'Max' }))
    await expect(args.onEffortChange).toHaveBeenCalledWith('max')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())

    await userEvent.click(
      canvas.getByRole('combobox', { name: 'Claude Opus 5.5' }),
    )
    const picker = await screen.findByRole('dialog', { name: 'Select model' })
    await userEvent.click(
      within(picker).getByRole('option', { name: /Claude Sonnet 5/ }),
    )
    await expect(args.onModelChange).toHaveBeenCalledWith(
      'claude-sonnet-5',
      'claude-code',
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await expect(canvas.getByText('Claude Code behavior')).toBeVisible()
  },
}

/** A model with no effort levels: the effort row is left out. */
export const NoEffort: Story = {
  name: 'No effort',
  args: {
    selection: {
      ...selection,
      model: sonnet,
      modelId: 'claude-sonnet-5',
      effort: null,
      effortId: '',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('Default reasoning effort')).toBeNull()
  },
}

/** Empty: nothing chosen yet, so each picker says what to pick. */
export const Empty: Story = {
  args: {
    providers: [],
    selection: {
      provider: null,
      providerId: '',
      providerLabel: '',
      model: null,
      modelId: '',
      effort: null,
      effortId: '',
    },
  },
  play: async ({ canvas }) => {
    const provider = canvas.getByRole('combobox', { name: 'Default provider' })
    await expect(provider).toHaveTextContent('Select provider')
    await expect(provider).toHaveAttribute('data-disabled')
    await expect(
      canvas.getByRole('combobox', { name: 'Select model' }),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...NoEffort,
  name: 'Dark',
  globals: { theme: 'dark' },
}
