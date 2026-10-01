import type { Meta, StoryObj } from '@storybook/react-vite'
import { Ellipsis, GitBranch, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { expect, waitFor } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Badge } from '../badge/badge'
import { StatusDot } from '../status-dot/status-dot'
import { ListRow } from './list-row'

const SESSIONS = [
  { id: 'importer', title: 'Rewrite the importer', when: '4 min' },
  { id: 'tokens', title: 'Move the tokens', when: '1 h' },
  { id: 'release', title: 'Cut the release', when: '2 d' },
]

/** A session list: buttons as rows, one chosen, each with a ⋯ of its own. */
function SessionList() {
  const [chosen, setChosen] = useState('importer')
  return (
    <nav
      aria-label="Sessions"
      className="flex w-72 flex-col gap-0.5 rounded-md bg-canvas p-2"
    >
      {SESSIONS.map((session) => (
        <ListRow
          key={session.id}
          density="compact"
          selected={chosen === session.id}
          leading={<MessageSquare aria-hidden />}
          title={session.title}
          trailing={session.when}
          render={
            <button type="button" onClick={() => setChosen(session.id)} />
          }
          actions={
            <button
              type="button"
              aria-label={`More for ${session.title}`}
              className="rounded-sm p-1 text-ink-muted hover:text-ink"
            >
              <Ellipsis className="size-3.5" />
            </button>
          }
        />
      ))}
    </nav>
  )
}

const rowOf = (element: Element) =>
  element.closest('[data-slot="list-row"]') as HTMLElement

const meta = {
  title: 'Components/ListRow',
  component: SessionList,
} satisfies Meta<typeof SessionList>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Each row is a button; the chosen one is aria-current. A row's own ⋯ is
 * hidden until the row is hovered or focused, and the keyboard reaches it.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const first = canvas.getByRole('button', { name: /^Rewrite the importer/ })
    await expect(first).toHaveAttribute('aria-current', 'true')
    const more = canvas.getByRole('button', {
      name: 'More for Rewrite the importer',
    })
    await expect(getComputedStyle(more.parentElement as Element).opacity).toBe(
      '0',
    )
    await userEvent.tab()
    await expect(first).toHaveFocus()
    await expect(getComputedStyle(first).outlineStyle).toBe('solid')
    await userEvent.tab()
    await expect(more).toHaveFocus()
    // Revealed for the keyboard, after the tokens' fast fade.
    await waitFor(() =>
      expect(getComputedStyle(more.parentElement as Element).opacity).toBe('1'),
    )
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    const first = canvas.getByRole('button', { name: /^Rewrite the importer/ })
    await expect(getComputedStyle(rowOf(first)).backgroundColor).toBe(
      tokenColor('--fill-selected'),
    )
  },
}

/**
 * Selected (R7): the chosen row wears the selected fill and aria-current;
 * choosing another moves both.
 */
export const Selected: Story = {
  play: async ({ canvas, userEvent }) => {
    const first = canvas.getByRole('button', { name: /^Rewrite the importer/ })
    const second = canvas.getByRole('button', { name: /^Move the tokens/ })
    await expect(getComputedStyle(rowOf(first)).backgroundColor).toBe(
      tokenColor('--fill-selected'),
    )
    await userEvent.click(second)
    await expect(second).toHaveAttribute('aria-current', 'true')
    await expect(first).not.toHaveAttribute('aria-current')
    // Read the token outside waitFor: its probe is a DOM change, which would
    // wake waitFor's observer again and again.
    const selectedFill = tokenColor('--fill-selected')
    await waitFor(() =>
      expect(getComputedStyle(rowOf(second)).backgroundColor).toBe(
        selectedFill,
      ),
    )
  },
}

/** Long: a title, a meta line and marks, in a default-density link row. */
export const Long: Story = {
  render: () => (
    <div className="w-80 rounded-md bg-canvas p-2">
      <ListRow
        leading={<StatusDot tone="info" />}
        title="Rewrite the importer so that it understands every legacy format at once"
        marks={<Badge tone="warning">Needs you</Badge>}
        identifier="MAR-3616"
        meta={
          <>
            <span>convergence</span>
            <span>ui/ds3d-display</span>
            <span>4 min ago</span>
          </>
        }
        render={<a href="#session" />}
      />
    </div>
  ),
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: /^Rewrite the importer/ })
    const title = link.querySelector(
      '[data-slot="list-row-title"] > span',
    ) as HTMLElement
    await expect(getComputedStyle(title).textOverflow).toBe('ellipsis')
    await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
    // The mark keeps its place when the title is cut.
    await expect(canvas.getByText('Needs you')).toBeVisible()
    const metaLine = link.querySelector(
      '[data-slot="list-row-meta"]',
    ) as HTMLElement
    await expect(metaLine).toHaveTextContent(/MAR-3616/)
  },
}

/** Disabled: dimmed, and the button is disabled for the keyboard as well. */
export const Disabled: Story = {
  render: () => (
    <div className="w-72 rounded-md bg-canvas p-2">
      <ListRow
        density="dense"
        disabled
        leading={<GitBranch aria-hidden />}
        title="release/0.96"
        trailing="locked"
        render={<button type="button" />}
      />
    </div>
  ),
  play: async ({ canvas }) => {
    const row = canvas.getByRole('button', { name: /release/ })
    await expect(row).toBeDisabled()
    await expect(getComputedStyle(rowOf(row)).opacity).toBe('0.5')
  },
}

/** Tree: each level indents 12 px; the titles start in one column per level. */
export const Tree: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-0.5 rounded-md bg-canvas p-2">
      {[
        { depth: 0, title: 'convergence' },
        { depth: 1, title: 'master' },
        { depth: 2, title: 'Rewrite the importer' },
        { depth: 1, title: 'ui/ds3d-display' },
      ].map((row) => (
        <ListRow
          key={row.title}
          density="compact"
          depth={row.depth}
          leading={<GitBranch aria-hidden />}
          title={row.title}
          render={<button type="button" />}
        />
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const left = (name: string) =>
      canvas.getByRole('button', { name }).getBoundingClientRect().left
    await expect(left('master') - left('convergence')).toBe(12)
    await expect(left('Rewrite the importer') - left('master')).toBe(12)
    await expect(left('ui/ds3d-display')).toBe(left('master'))
  },
}
