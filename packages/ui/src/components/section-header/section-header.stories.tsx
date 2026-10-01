import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { expect, waitFor } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import {
  Collapsible,
  CollapsiblePanel,
} from '../../motion/collapsible/collapsible'
import { SectionHeader } from './section-header'

type SidebarSectionProps = { label: string }

/** A sidebar section's head over its rows. */
function SidebarSection({ label }: SidebarSectionProps) {
  return (
    <div className="flex w-64 flex-col gap-1 rounded-md bg-canvas p-2">
      <SectionHeader
        label={label}
        count={3}
        action={
          <button
            type="button"
            aria-label="New session"
            className="rounded-sm p-0.5 text-ink-muted hover:text-ink"
          >
            <Plus className="size-3.5" />
          </button>
        }
      />
      <ul className="text-xs text-ink">
        <li>Rewrite the importer</li>
        <li>Move the tokens</li>
        <li>Cut the release</li>
      </ul>
    </div>
  )
}

const meta = {
  title: 'Components/SectionHeader',
  component: SidebarSection,
  args: { label: 'Sessions' },
} satisfies Meta<typeof SidebarSection>

export default meta

type Story = StoryObj<typeof meta>

/** A heading in the sidebar's 11 px medium muted print, a count and an action. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const heading = canvas.getByRole('heading', { level: 2, name: 'Sessions' })
    const style = getComputedStyle(heading)
    await expect(style.fontSize).toBe('11px')
    await expect(style.color).toBe(tokenColor('--ink-muted'))
    await expect(canvas.getByText('3')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'New session' }),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

/** A section that folds: Archived, closed until asked. */
function ArchivedSection() {
  const [open, setOpen] = useState(false)
  return (
    <div className="w-64 rounded-md bg-canvas p-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <SectionHeader label="Archived" count={12} collapsible />
        <CollapsiblePanel>
          <ul className="pt-1 text-xs text-ink">
            <li>An old conversation</li>
          </ul>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  )
}

/** Collapsible: its words are the trigger, with aria-expanded, inside the heading. */
export const Collapsible_: Story = {
  name: 'Collapsible',
  render: () => <ArchivedSection />,
  play: async ({ canvas, userEvent }) => {
    const heading = canvas.getByRole('heading', { level: 2, name: 'Archived' })
    const trigger = canvas.getByRole('button', { name: 'Archived' })
    await expect(heading).toContainElement(trigger)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() =>
      expect(canvas.getByText('An old conversation')).toBeVisible(),
    )
  },
}

/** Long: the name is cut short; the count and the action keep their place. */
export const Long: Story = {
  args: { label: 'Sessions in every repository this project has ever opened' },
  play: async ({ canvas }) => {
    const words = canvas.getByText(/Sessions in every/)
    await expect(getComputedStyle(words).textOverflow).toBe('ellipsis')
    await expect(words.scrollWidth).toBeGreaterThan(words.clientWidth)
    await expect(
      canvas.getByRole('button', { name: 'New session' }),
    ).toBeVisible()
  },
}
