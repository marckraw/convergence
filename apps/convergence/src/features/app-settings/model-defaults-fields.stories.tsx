import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { ProviderInfo, ProviderModelOption } from '@/entities/session'
import { TooltipProvider } from '@convergence/ui'
import { ModelDefaultsFields } from './model-defaults-fields.presentational'

const model = (id: string, label: string): ProviderModelOption => ({
  id,
  label,
  defaultEffort: null,
  effortOptions: [],
})

/** A conversation provider as the main process reports it, trimmed to what the rows read. */
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
  title: 'Features/AppSettings/ModelDefaults',
  component: ModelDefaultsFields,
  args: {
    providers,
    chosen: { codex: 'gpt-5.5-mini' },
    fallback: 'fast',
    purpose: 'Session naming',
    onModelChange: fn(),
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
} satisfies Meta<typeof ModelDefaultsFields>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Session naming: one row per provider, named for its vendor (or its own name
 * when it has none), its picker showing the choice, else the provider's fast
 * model, else its default. Choosing a model reports the provider too.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Pi')).toBeVisible()
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
    await expect(args.onModelChange).toHaveBeenCalledWith(
      'claude-code',
      'claude-sonnet-5',
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Session forking: with nothing chosen, the provider's default model, not its fast one. */
export const Forking: Story = {
  args: {
    chosen: { pi: 'gpt-oss-120b' },
    fallback: 'default',
    purpose: 'Session forking',
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Claude Opus 5.5' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('combobox', { name: 'gpt-oss 120B' }),
    ).toBeVisible()
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
