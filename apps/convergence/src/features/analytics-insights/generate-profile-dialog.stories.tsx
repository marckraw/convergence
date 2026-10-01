import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { ProviderInfo } from '@/entities/session'
import { GenerateProfileDialog } from './generate-profile-dialog.presentational'

const codex: ProviderInfo = {
  id: 'codex',
  name: 'Codex',
  vendorLabel: 'OpenAI',
  kind: 'conversation',
  supportsContinuation: true,
  supportsConversationReset: false,
  defaultModelId: 'gpt-5.5',
  modelOptions: [
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      defaultEffort: 'medium',
      effortOptions: [],
    },
    {
      id: 'gpt-5.5-mini',
      label: 'GPT-5.5 mini',
      defaultEffort: null,
      effortOptions: [],
    },
  ],
  attachments: {
    supportsImage: true,
    supportsPdf: false,
    supportsText: true,
    maxImageBytes: 5_000_000,
    maxPdfBytes: 0,
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
}

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', {
    name: 'Generate work profile',
  })
  await waitFor(() =>
    expect(dialog).toContainElement(document.activeElement as HTMLElement),
  )
  // Rests once its pop-in has finished, so what is checked is what is seen.
  await waitFor(() =>
    expect(
      dialog.getAnimations().filter((a) => a.playState === 'running'),
    ).toHaveLength(0),
  )
  return dialog
}

const meta = {
  title: 'Features/AnalyticsInsights/GenerateProfileDialog',
  component: GenerateProfileDialog,
  args: {
    open: true,
    providerId: 'codex',
    providerLabel: 'OpenAI',
    modelId: 'gpt-5.5',
    modelLabel: 'GPT-5.5',
    providers: [codex],
    providerItems: [{ id: 'codex', label: 'OpenAI', description: 'Codex' }],
    isGenerating: false,
    onOpenChange: fn(),
    onProviderChange: fn(),
    onModelChange: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof GenerateProfileDialog>

export default meta

type Story = StoryObj<typeof meta>

/**
 * What is sent and what is not, the provider and model to ask, and two
 * endings: Cancel and Generate.
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'Create an optional profile from local aggregate usage data.',
    )
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'GPT-5.5' }),
    )
    const picker = await screen.findByRole('dialog', { name: 'Select model' })
    await userEvent.click(
      within(picker).getByRole('option', { name: /GPT-5.5 mini/ }),
    )
    await expect(args.onModelChange).toHaveBeenCalledWith(
      'gpt-5.5-mini',
      'codex',
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Select model' })).toBeNull(),
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Generate' }),
    )
    await expect(args.onConfirm).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** Busy: generating locks the pickers, and Generate says so after a moment. */
export const Busy: Story = {
  args: { isGenerating: true },
  play: async () => {
    const dialog = await openDialog()
    const generate = within(dialog).getByRole('button', { name: 'Generate' })
    await waitFor(() => expect(generate).toHaveAttribute('aria-busy', 'true'), {
      timeout: 1_000,
    })
    await expect(generate).toHaveTextContent('Generating…')
    await expect(
      within(dialog).getByRole('combobox', { name: 'Provider' }),
    ).toBeDisabled()
  },
}

/** Disabled: no provider to ask, so nothing can be generated. */
export const Disabled: Story = {
  args: {
    providerId: '',
    providerLabel: 'Provider',
    modelId: '',
    modelLabel: 'Model',
    providers: [],
    providerItems: [],
  },
  play: async () => {
    const dialog = await openDialog()
    const generate = within(dialog).getByRole('button', { name: 'Generate' })
    await expect(generate).toHaveAttribute('aria-disabled', 'true')
    await expect(generate).toHaveAccessibleDescription(
      'Choose a provider first.',
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
