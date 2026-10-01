import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { ChoiceField, Switch } from '@convergence/ui'
import { SettingsSubsection } from './settings-subsection.presentational'

const meta = {
  title: 'Features/AppSettings/SettingsSubsection',
  component: SettingsSubsection,
  args: {
    title: 'Context alert',
    description:
      'Warns when a conversation is close to its context window, so you can fork or compact before the provider does it for you.',
    children: (
      <ChoiceField label="Warn me when a conversation fills up">
        <Switch id="story-context-alert" checked onCheckedChange={() => {}} />
      </ChoiceField>
    ),
  },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsSubsection>

export default meta

type Story = StoryObj<typeof meta>

/** A heading, a line of help, and the controls it introduces. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Context alert' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('switch', {
        name: 'Warn me when a conversation fills up',
      }),
    ).toBeVisible()
  },
}

/** Below another subsection: a divider separates them. */
export const WithDivider: Story = {
  name: 'With divider',
  args: { withDivider: true },
}

/** Without help text: the heading alone. */
export const NoDescription: Story = {
  name: 'No description',
  args: { description: undefined },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Context alert' }),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
