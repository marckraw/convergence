import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { ProviderInfo, ProviderModelOption } from '@/entities/session'
import { TooltipProvider } from '@convergence/ui'
import { ExtractionModelDefaultsFields } from './extraction-model-defaults.presentational'

const model = (id: string, label: string): ProviderModelOption => ({
  id,
  label,
  defaultEffort: null,
  effortOptions: [],
})

/** A conversation provider as the main process reports it, trimmed to what extraction reads. */
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
      model('claude-haiku-4-5', 'Claude Haiku 4.5'),
    ],
  }),
  provider({
    id: 'pi',
    name: 'Pi',
    vendorLabel: '',
    defaultModelId: 'qwen3-coder',
    modelOptions: [
      model('qwen3-coder', 'Qwen3 Coder'),
      model('gpt-oss-120b', 'gpt-oss 120B'),
    ],
  }),
]

const meta = {
  title: 'Features/AppSettings/ExtractionModelDefaults',
  component: ExtractionModelDefaultsFields,
  args: {
    providers,
    extractionDraft: { pi: 'gpt-oss-120b' },
    onExtractionModelChange: fn(),
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
} satisfies Meta<typeof ExtractionModelDefaultsFields>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One row per provider, named for its vendor, or its own name when it has
 * none; the picker shows the draft, else the provider's default (not its
 * fast model, as naming does).
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Pi')).toBeVisible()
    await expect(
      canvas.getByRole('combobox', { name: 'gpt-oss 120B' }),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('combobox', { name: 'Claude Opus 5.5' }),
    )
    const picker = await screen.findByRole('dialog', { name: 'Select model' })
    await userEvent.click(
      within(picker).getByRole('option', { name: /Claude Haiku 4.5/ }),
    )
    await expect(args.onExtractionModelChange).toHaveBeenCalledWith(
      'claude-code',
      'claude-haiku-4-5',
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Empty: no provider reported yet. */
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
