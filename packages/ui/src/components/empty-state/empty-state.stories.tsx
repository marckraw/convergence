import type { Meta, StoryObj } from '@storybook/react-vite'
import { CloudOff, MessageSquare, Search } from 'lucide-react'
import { useState } from 'react'
import { expect, waitFor } from 'storybook/test'
import { EmptyState } from './empty-state'

/** A panel's list with nothing in it yet. */
function NoSessions() {
  return (
    <div className="w-80 rounded-md bg-canvas p-4">
      <EmptyState
        icon={MessageSquare}
        title="No sessions yet"
        detail="Start one from the composer."
      />
    </div>
  )
}

const meta = {
  title: 'Components/EmptyState',
  component: NoSessions,
} satisfies Meta<typeof NoSessions>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The dashed box, centred words: a muted glyph, the title, a sentence under
 * it. It isn't announced: it's what the list is, not news.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const box = canvasElement.querySelector(
      '[data-slot="empty-state"]',
    ) as HTMLElement
    await expect(getComputedStyle(box).borderTopStyle).toBe('dashed')
    await expect(getComputedStyle(box).textAlign).toBe('center')
    await expect(canvas.getByText('No sessions yet')).toBeVisible()
    await expect(canvas.queryByRole('alert')).toBeNull()
    await expect(canvas.queryByRole('status')).toBeNull()
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

/** Empty: nothing matches a search (R10's words). */
export const Empty: Story = {
  render: () => (
    <div className="w-80 rounded-md bg-canvas p-4">
      <EmptyState
        icon={Search}
        title="No skills match “lint”"
        detail="Try other words."
      />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No skills match “lint”')).toBeVisible()
  },
}

/**
 * Busy: nothing for the first 300 ms, so a quick load flashes nothing, then
 * a spinner and "Loading …" as a status.
 */
export const Busy: Story = {
  render: () => (
    <div className="w-80 rounded-md bg-canvas p-4">
      <EmptyState state="loading" title="Loading sessions…" />
    </div>
  ),
  play: async ({ canvas }) => {
    const status = canvas.getByRole('status')
    await expect(status).not.toHaveTextContent('Loading sessions…')
    await waitFor(() => expect(status).toHaveTextContent('Loading sessions…'), {
      timeout: 1000,
    })
  },
}

/** A list that couldn't load, and tries again when asked. */
function CouldNotLoad() {
  const [retrying, setRetrying] = useState(false)
  return (
    <div className="w-80 rounded-md bg-canvas p-4">
      <EmptyState
        state="failed"
        icon={CloudOff}
        title="Couldn't load the skills"
        detail="The provider didn't answer."
        retrying={retrying}
        onRetry={() => setRetrying(true)}
      />
    </div>
  )
}

/**
 * Failed (R10): "Couldn't …" with the reason, as an alert, and Try again,
 * which says it's trying once that has taken 300 ms.
 */
export const Failed: Story = {
  render: () => <CouldNotLoad />,
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      "Couldn't load the skills",
    )
    const retry = canvas.getByRole('button', { name: 'Try again' })
    await userEvent.click(retry)
    // Button's `pending`, after useDelayedLoading's 300 ms: busy, and says so.
    await waitFor(
      () => {
        expect(retry).toHaveAttribute('aria-busy', 'true')
        expect(retry).toHaveAccessibleName('Trying again…')
      },
      { timeout: 1000 },
    )
  },
}

/** Compact: the sidebar's and the pickers' smaller box. */
export const Compact: Story = {
  render: () => (
    <div className="w-56 rounded-md bg-canvas p-2">
      <EmptyState size="compact" title="No archived sessions" />
    </div>
  ),
  play: async ({ canvas }) => {
    const title = canvas.getByText('No archived sessions')
    await expect(getComputedStyle(title).fontSize).toBe('12px')
  },
}

/** Long: a long query breaks inside the box rather than overflowing it. */
export const Long: Story = {
  render: () => (
    <div className="w-64 rounded-md bg-canvas p-4">
      <EmptyState
        icon={Search}
        title="No sessions match “rewrite-the-importer-so-it-understands-every-legacy-format”"
        detail="Try fewer words, or look in the archived sessions as well."
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const box = canvasElement.querySelector(
      '[data-slot="empty-state"]',
    ) as HTMLElement
    await expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth)
  },
}
