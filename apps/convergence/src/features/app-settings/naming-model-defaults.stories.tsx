import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { ProviderInfo, ProviderModelOption } from '@/entities/session'
import { TooltipProvider } from '@convergence/ui'
import { NamingModelDefaultsFields } from './naming-model-defaults.presentational'

const model = (id: string, label: string): ProviderModelOption => ({
  id,
  label,
  defaultEffort: null,
  effortOptions: [],
})

/** A conversation provider as the main process reports it, trimmed to what naming reads. */
const provider = (
  fields: Pick<ProviderInfo, 'id' | 'name' | 'vendorLabel' | 'defaultModelId'> &
    Partial<ProviderInfo>,
): ProviderInfo => ({
  kind: 'conversation',
  supportsContinuation: true,
  supportsConversationReset: true,
  modelOptions: [],
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
    supportsSteer: false,
    supportsInterrupt: true,
    defaultRunningMode: 'follow-up',
  },
  ...fields,
})

const providers: ProviderInfo[] = [
  provider({
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    defaultModelId: 'claude-opus-5-5',
    fastModelId: 'claude-haiku-4-5',
    modelOptions: [
      model('claude-opus-5-5', 'Claude Opus 5.5'),
      model('claude-sonnet-5', 'Claude Sonnet 5'),
      model('claude-haiku-4-5', 'Claude Haiku 4.5'),
    ],
  }),
  provider({
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    defaultModelId: 'gpt-5.5',
    modelOptions: [
      model('gpt-5.5', 'GPT-5.5'),
      model('gpt-5.5-mini', 'GPT-5.5 mini'),
    ],
  }),
]

const meta = {
  title: 'Features/AppSettings/NamingModelDefaults',
  component: NamingModelDefaultsFields,
  args: {
    providers,
    namingDraft: { codex: 'gpt-5.5-mini' },
    onNamingModelChange: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={0}>
        <div className="w-[560px]">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof NamingModelDefaultsFields>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One row per provider, its picker showing the draft, else the provider's
 * fast model, else its default. Choosing a model reports the provider too.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'GPT-5.5 mini' }),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('combobox', { name: 'Claude Haiku 4.5' }),
    )
    const picker = await screen.findByRole('dialog', { name: 'Select model' })
    await userEvent.click(
      within(picker).getByRole('option', { name: /Claude Sonnet 5/ }),
    )
    await expect(args.onNamingModelChange).toHaveBeenCalledWith(
      'claude-code',
      'claude-sonnet-5',
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Empty: no provider reported yet, so there is nothing to choose. */
export const Empty: Story = {
  args: { providers: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('combobox')).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
