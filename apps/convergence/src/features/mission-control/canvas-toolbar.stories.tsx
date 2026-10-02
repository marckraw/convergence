import type { Meta, StoryObj } from '@storybook/react-vite'
import { Upload } from 'lucide-react'
import { expect, fn } from 'storybook/test'
import { Button } from '@convergence/ui'
import { CanvasToolbar } from './canvas-toolbar.presentational'

const meta = {
  title: 'Features/MissionControl/CanvasToolbar',
  component: CanvasToolbar,
  args: {
    importCrew: (
      <Button type="button" variant="ghost" size="sm" className="text-2xs">
        <Upload aria-hidden className="size-3" />
        Import crew
      </Button>
    ),
    crewName: 'convergence development',
    summary: '4 connections · on',
    connecting: false,
    canConnect: true,
    waitingCount: 0,
    onAddConversation: fn(),
    onToggleConnect: fn(),
    onCrewSettings: fn(),
    onHistory: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-225">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CanvasToolbar>

export default meta

type Story = StoryObj<typeof meta>

/** The row above a crew's frame: every authoring verb, named. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('heading', { name: 'convergence development' }),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Add conversation' }),
    )
    await expect(args.onAddConversation).toHaveBeenCalledOnce()
    const connect = canvas.getByRole('button', { name: 'Connect' })
    await expect(connect).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(connect)
    await expect(args.onToggleConnect).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Crew settings' }))
    await expect(args.onCrewSettings).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'History' }))
    await expect(args.onHistory).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Connect armed, and calls waiting on the crew counted on History. */
export const Busy: Story = {
  args: { connecting: true, waitingCount: 2 },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Connect' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      canvas.getByRole('button', { name: 'History · 2' }),
    ).toBeVisible()
  },
}

/** No crew yet: only Import works; Connect waits for two conversations. */
export const Disabled: Story = {
  args: {
    hasCrew: false,
    canConnect: false,
    crewName: 'No crew yet',
    summary: '0 conversations · 0 connections',
  },
  play: async ({ canvas }) => {
    for (const name of ['Add conversation', 'Crew settings', 'History']) {
      await expect(canvas.getByRole('button', { name })).toBeDisabled()
    }
    // Connect is unavailable with a reason (R2, MAR-3616): it stays
    // focusable and says why.
    const connect = canvas.getByRole('button', { name: 'Connect' })
    await expect(connect).toHaveAttribute('aria-disabled', 'true')
    await expect(connect).toHaveAccessibleDescription(
      'Add a second conversation to this crew before connecting.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Import crew' }),
    ).toBeEnabled()
  },
}
