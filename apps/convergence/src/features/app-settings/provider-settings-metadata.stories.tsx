import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import type { ProviderInfo } from '@/entities/session'
import { ProviderSettingsMetadata } from './provider-settings-metadata.presentational'

/** Cursor, as the ACP probe reports it: modes, partial telemetry, help. */
const cursor: ProviderInfo = {
  id: 'cursor',
  name: 'Cursor',
  vendorLabel: 'Anysphere',
  kind: 'conversation',
  supportsContinuation: true,
  supportsConversationReset: false,
  defaultModelId: 'default[]',
  modelOptions: [],
  attachments: {
    supportsImage: true,
    supportsPdf: false,
    supportsText: true,
    maxImageBytes: 10 * 1024 * 1024,
    maxPdfBytes: 0,
    maxTextBytes: 1024 * 1024,
    maxTotalBytes: 50 * 1024 * 1024,
  },
  midRunInput: {
    supportsAnswer: true,
    supportsNativeFollowUp: false,
    supportsAppQueuedFollowUp: true,
    supportsSteer: false,
    supportsInterrupt: false,
    defaultRunningMode: 'follow-up',
  },
  configOptions: [
    {
      id: 'mode',
      label: 'Mode',
      currentValue: 'agent',
      source: 'provider',
      persistence: 'session',
      method: 'session/set_mode',
      options: [
        { id: 'agent', label: 'Agent' },
        { id: 'plan', label: 'Plan' },
      ],
    },
    {
      id: 'sandbox',
      label: 'Sandbox',
      currentValue: null,
      source: 'fallback',
      persistence: 'unsupported',
      options: [],
    },
  ],
  telemetry: {
    contextWindow: { availability: 'partial', source: 'model-metadata' },
    quota: {
      availability: 'unavailable',
      source: 'manual',
      usageUrl: 'https://cursor.com/dashboard',
    },
  },
  settings: {
    help: [
      {
        label: 'Usage',
        value:
          'Cursor does not report usage to agents. Check the dashboard for what this account has spent.',
      },
    ],
    links: [{ label: 'Cursor dashboard', url: 'https://cursor.com/dashboard' }],
  },
}

const meta = {
  title: 'Features/AppSettings/ProviderSettingsMetadata',
  component: ProviderSettingsMetadata,
  args: { provider: cursor },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProviderSettingsMetadata>

export default meta

type Story = StoryObj<typeof meta>

/** What the provider reports: its options, its telemetry, its help, its links. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Cursor behavior')).toBeVisible()
    await expect(canvas.getByText('Agent')).toBeVisible()
    await expect(canvas.getByText('Unsupported')).toBeVisible()
    await expect(canvas.getByText('Partial')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Cursor dashboard' }),
    ).toBeVisible()
  },
}

/** Empty: a provider that reports nothing draws nothing. */
export const Empty: Story = {
  args: {
    provider: {
      ...cursor,
      configOptions: [],
      telemetry: undefined,
      settings: undefined,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/behavior$/)).toBeNull()
  },
}

/** No provider chosen: nothing either. */
export const NoProvider: Story = {
  name: 'No provider',
  args: { provider: null },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/behavior$/)).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
