import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import {
  UsageHeading,
  UsageMeterRow,
  UsageNote,
  UsageSection,
} from './usage-popover.presentational'

type UsagePanelProps = { available: boolean }

/** A usage popover's body, as the composer's two pills draw it. */
function UsagePanel({ available }: UsagePanelProps) {
  return (
    <div className="w-80 max-w-full space-y-3 rounded-md border border-line bg-raised p-3">
      <UsageHeading title="Codex usage" detail="checked 14:07" />
      {available ? (
        <div className="space-y-2">
          <UsageMeterRow
            label="5 hour"
            detail="Resets Oct 1, 6:30 PM"
            value={64}
            valueLabel="64%"
            tone="success"
            meterLabel="5 hour quota remaining"
          />
          <UsageMeterRow
            label="Weekly"
            detail="Resets Oct 5, 9:00 AM"
            value={22}
            valueLabel="22%"
            tone="warning"
            meterLabel="Weekly quota remaining"
          />
          <UsageMeterRow
            label="Remaining"
            value={null}
            valueLabel="--"
            tone="neutral"
            meterLabel="Context window remaining"
          />
        </div>
      ) : (
        <UsageNote>Codex usage is unavailable.</UsageNote>
      )}
      <UsageSection className="text-2xs text-ink-muted">
        Refreshes quietly while visible
      </UsageSection>
    </div>
  )
}

const meta = {
  title: 'Features/Composer/UsagePopover',
  component: UsagePanel,
  args: { available: true },
} satisfies Meta<typeof UsagePanel>

export default meta

type Story = StoryObj<typeof meta>

/** Each reading is a meter in its tone, its number in a column that lines up. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const meter = canvas.getByRole('meter', { name: '5 hour quota remaining' })
    await expect(meter).toHaveAttribute('aria-valuenow', '64')
    await expect(meter).toHaveAttribute('data-tone', 'success')
    await expect(
      canvas.getByRole('meter', { name: 'Weekly quota remaining' }),
    ).toHaveAttribute('data-tone', 'warning')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Nothing reported: a quiet note in place of the readings. */
export const Empty: Story = {
  args: { available: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Codex usage is unavailable.')).toBeVisible()
    await expect(canvas.queryByRole('meter')).toBeNull()
  },
}
