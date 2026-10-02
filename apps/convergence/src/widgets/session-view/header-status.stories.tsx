import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { HeaderStatus } from './header-status.presentational'
import { HarnessAlertChip } from './harness-alert-chip.presentational'

const onToggle = fn()
const onOpen = fn()

/** The conversation header's status row, every state in it at once. */
function StatusRow({ activity }: { activity: string }) {
  return (
    <div className="flex w-200 max-w-full flex-wrap items-center gap-1.5 rounded-md bg-canvas p-3">
      <HeaderStatus
        kind="parallel-work"
        label="2 running"
        expanded={false}
        onToggle={onToggle}
      />
      <HeaderStatus kind="archived" />
      <HeaderStatus kind="remote" />
      <HeaderStatus
        kind="activity"
        label={activity}
        testId="session-activity-indicator"
      />
      <HeaderStatus kind="worktree-removed" />
      <HarnessAlertChip
        label="Harness: rate limited until 14:00"
        expanded={false}
        onOpen={onOpen}
      />
    </div>
  )
}

const meta = {
  title: 'Widgets/SessionView/HeaderStatus',
  component: StatusRow,
  args: { activity: 'Editing session-view.container.tsx' },
} satisfies Meta<typeof StatusRow>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Every state in the header's row is one pill: one height, one print, and the
 * tone its state wears (R1). The two you can press open what they are about.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const heights = [
      canvas.getByRole('button', { name: '2 running' }),
      canvas.getByText('Archived'),
      canvas.getByTestId('session-remote-indicator'),
      canvas.getByTestId('session-activity-indicator'),
      canvas.getByText('Worktree removed'),
      canvas.getByTestId('harness-alert'),
    ].map(
      (element) =>
        (
          element.closest('[data-slot="status-pill"]') as Element
        ).getBoundingClientRect().height,
    )
    await expect(new Set(heights).size).toBe(1)
    await expect(
      canvas.getByTestId('session-remote-indicator'),
    ).toHaveAttribute('data-tone', 'info')
    await expect(canvas.getByTestId('harness-alert')).toHaveAttribute(
      'data-tone',
      'danger',
    )
    await userEvent.click(canvas.getByRole('button', { name: '2 running' }))
    await expect(onToggle).toHaveBeenCalled()
    await userEvent.click(canvas.getByTestId('harness-alert'))
    await expect(onOpen).toHaveBeenCalled()
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

/** A long activity is cut short at 12 rem; the full words are its tooltip. */
export const Long: Story = {
  args: {
    activity:
      'Running the whole Storybook suite in headless Chromium with axe, both themes',
  },
  play: async ({ canvas }) => {
    const pill = canvas.getByTestId('session-activity-indicator')
    await expect(pill).toHaveAttribute(
      'data-tooltip',
      'Running the whole Storybook suite in headless Chromium with axe, both themes',
    )
    await expect(pill.getBoundingClientRect().width).toBeLessThanOrEqual(192)
  },
}
