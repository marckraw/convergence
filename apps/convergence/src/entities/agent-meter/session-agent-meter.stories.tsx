import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { SessionAgentMeter } from './session-agent-meter.presentational'

const meta = {
  title: 'Entities/Agent meter/Session agent meter',
  component: SessionAgentMeter,
  args: {
    row: {
      sessionId: 'session-1',
      account: null,
      usage: { cpu: 12, memoryMb: 340 },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-80 rounded-lg border border-line bg-canvas p-2 text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SessionAgentMeter>

export default meta

type Story = StoryObj<typeof meta>

/** A metered agent: its CPU and memory, as a named row of the header's Details. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('CPU / memory')).toBeVisible()
    await expect(canvas.getByText('12% · 340 MB')).toBeVisible()
    // A term and its value (MC-16), lined up with the Details rows.
    await expect(canvas.getByText('12% · 340 MB').tagName).toBe('DD')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A shared account and a large footprint: gigabytes, and whose agent it is. */
export const Long: Story = {
  args: {
    row: {
      sessionId: 'session-1',
      account: 'marcin@work-account-with-a-long-name.example',
      usage: { cpu: 187, memoryMb: 2450 },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        '187% · 2.5 GB · shared · marcin@work-account-with-a-long-name.example',
      ),
    ).toBeInTheDocument()
  },
}

/** A remote agent is not metered here, and says so. */
export const Remote: Story = {
  args: { row: null, remote: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('remote')).toBeVisible()
  },
}

/** No reading draws nothing. */
export const Empty: Story = {
  args: { row: { sessionId: 'session-1', account: null, usage: null } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('CPU / memory')).toBeNull()
  },
}
