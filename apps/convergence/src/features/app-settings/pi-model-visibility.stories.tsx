import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import type { ProviderModelOption } from '@/entities/session'
import { PiModelVisibilityFields } from './pi-model-visibility.presentational'

const model = (id: string, label: string): ProviderModelOption => ({
  id,
  label,
  defaultEffort: null,
  effortOptions: [],
})

const modelsJsonModels = [
  model('ollama/qwen3-coder:30b', 'Qwen3 Coder 30B'),
  model('lmstudio/gpt-oss-20b', 'gpt-oss 20B'),
]

const optionalModels = [
  model('openrouter/anthropic/claude-sonnet-5', 'Claude Sonnet 5'),
  model('openrouter/google/gemini-3-pro', 'Gemini 3 Pro'),
  model('openrouter/deepseek/deepseek-v4', 'DeepSeek V4'),
]

const selectedModelIds = ['openrouter/google/gemini-3-pro']

const meta = {
  title: 'Features/AppSettings/PiModelVisibility',
  component: PiModelVisibilityFields,
  args: {
    providerExists: true,
    modelsJsonModels,
    optionalModels,
    query: '',
    selectedModelIds,
    selectedModelIdsSet: new Set(selectedModelIds),
    onQueryChange: fn(),
    onToggleModel: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PiModelVisibilityFields>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The models from models.json, always shown, then the extra ones to add: a
 * search, a checkbox per model, and Clear.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Qwen3 Coder 30B')).toBeVisible()
    await expect(canvas.getByText('1 selected')).toBeVisible()
    await expect(
      canvas.getByRole('checkbox', { name: /Gemini 3 Pro/ }),
    ).toBeChecked()
    await userEvent.click(canvas.getByRole('checkbox', { name: /DeepSeek V4/ }))
    await expect(args.onToggleModel).toHaveBeenCalledWith(
      'openrouter/deepseek/deepseek-v4',
      true,
    )
    await userEvent.type(
      canvas.getByPlaceholderText('Search available Pi models...'),
      'g',
    )
    await expect(args.onQueryChange).toHaveBeenCalledWith('g')
    await userEvent.click(canvas.getByRole('button', { name: 'Clear' }))
    await expect(args.onToggleModel).toHaveBeenLastCalledWith(
      'openrouter/google/gemini-3-pro',
      false,
    )
  },
}

/** Empty: models.json lists nothing, and the search matches nothing. */
export const Empty: Story = {
  args: {
    modelsJsonModels: [],
    optionalModels: [],
    query: 'mistral',
    selectedModelIds: [],
    selectedModelIdsSet: new Set<string>(),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('No Pi models were found in models.json.'),
    ).toBeVisible()
    await expect(canvas.getByText('No matching Pi models.')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Clear' })).toBeNull()
  },
}

/** Disabled: Pi is not part of this build. */
export const Disabled: Story = {
  args: { providerExists: false },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Pi is not available in this app runtime.'),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
