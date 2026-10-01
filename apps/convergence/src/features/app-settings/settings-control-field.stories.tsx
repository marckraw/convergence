import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen } from 'storybook/test'
import { Button, TooltipProvider } from '@convergence/ui'
import { SettingsControlField } from './settings-control-field.presentational'

const meta = {
  title: 'Features/AppSettings/SettingsControlField',
  component: SettingsControlField,
  args: {
    title: 'Default model',
    description:
      'The model a new conversation starts with. Each provider keeps its own.',
    children: <Button variant="secondary">Claude Opus 5.5</Button>,
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="w-[560px]">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof SettingsControlField>

export default meta

type Story = StoryObj<typeof meta>

/** A title, its control, and an info button whose tooltip explains it. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const info = canvas.getByRole('button', { name: 'About Default model' })
    await userEvent.hover(info)
    await expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'The model a new conversation starts with.',
    )
    await userEvent.unhover(info)
  },
}

/** Without a description there is nothing to explain, so no info button. */
export const NoDescription: Story = {
  name: 'No description',
  args: { description: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: /^About/ })).toBeNull()
  },
}

/** Long: a long title truncates instead of pushing the control out. */
export const Long: Story = {
  args: {
    title:
      'The model that names new conversations from their first message, when the provider has none of its own',
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Claude Opus 5.5' }),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
