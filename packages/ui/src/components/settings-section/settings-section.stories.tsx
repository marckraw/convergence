import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bell } from 'lucide-react'
import { expect } from 'storybook/test'
import { SettingsSection } from './settings-section'

type SessionDefaultsProps = { description: string }

/** Two settings groups in the dialog's Session defaults tab. */
function SessionDefaults({ description }: SessionDefaultsProps) {
  return (
    <div className="w-120 max-w-full space-y-6 rounded-md bg-canvas p-6">
      <SettingsSection title="New sessions" description={description}>
        <SettingsSection
          compact
          title="Model"
          description="Used when a session starts."
        >
          <span className="text-sm text-ink">Claude Opus</span>
        </SettingsSection>
      </SettingsSection>
      <SettingsSection
        divided
        title="Notifications"
        icon={<Bell />}
        description="When a session needs you, even with Convergence in the background."
      >
        <p className="text-sm text-ink">Every session</p>
      </SettingsSection>
    </div>
  )
}

const meta = {
  title: 'Components/SettingsSection',
  component: SessionDefaults,
  args: {
    description:
      'What every session starts with, unless the project says other.',
  },
} satisfies Meta<typeof SessionDefaults>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A region named by its 14 px semibold heading, a muted line under it, its
 * controls below; a divided one has a hairline above.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const group = canvas.getByRole('region', { name: 'New sessions' })
    const heading = canvas.getByRole('heading', {
      level: 4,
      name: 'New sessions',
    })
    await expect(group).toContainElement(heading)
    await expect(getComputedStyle(heading).fontSize).toBe('14px')
    await expect(getComputedStyle(heading).fontWeight).toBe('600')
    const notifications = canvas.getByRole('region', { name: 'Notifications' })
    await expect(getComputedStyle(notifications).borderTopStyle).toBe('solid')
  },
}

/** Compact: one setting on its bordered row, its control at the end. */
export const Compact: Story = {
  play: async ({ canvas }) => {
    const row = canvas.getByRole('region', { name: 'Model' })
    await expect(row).toHaveTextContent('Used when a session starts.')
    const name = canvas.getByRole('heading', { name: 'Model' })
    const control = canvas.getByText('Claude Opus')
    // The control sits at the row's end, inside its padding.
    await expect(
      row.getBoundingClientRect().right - control.getBoundingClientRect().right,
    ).toBeLessThanOrEqual(17)
    await expect(name.getBoundingClientRect().left).toBeLessThan(
      control.getBoundingClientRect().left,
    )
  },
}

/**
 * Labelled: the same provider's row in two lists keeps one heading, and each
 * region is named for its list, so no two share a name.
 */
export const Labelled: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <SettingsSection
        compact
        title="Anthropic"
        label="Session naming: Anthropic"
      >
        <span className="text-sm">Claude Haiku 4.5</span>
      </SettingsSection>
      <SettingsSection
        compact
        title="Anthropic"
        label="Session forking: Anthropic"
      >
        <span className="text-sm">Claude Opus 5.5</span>
      </SettingsSection>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('region', { name: 'Session naming: Anthropic' }),
    ).toHaveTextContent('Claude Haiku 4.5')
    await expect(
      canvas.getByRole('region', { name: 'Session forking: Anthropic' }),
    ).toHaveTextContent('Claude Opus 5.5')
    await expect(
      canvas.getAllByRole('heading', { name: 'Anthropic' }),
    ).toHaveLength(2)
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

/** Long: the description wraps under its heading; it never hides behind an ⓘ. */
export const Long: Story = {
  args: {
    description:
      'What every session starts with, unless the project says other: the model, the effort, the permission mode, the provider account and whether a session starts in a fresh worktree or in the project folder itself.',
  },
  play: async ({ canvas }) => {
    const words = canvas.getByText(/the permission mode/)
    await expect(words.getBoundingClientRect().height).toBeGreaterThan(20)
    await expect(words.scrollWidth).toBeLessThanOrEqual(words.clientWidth)
  },
}
