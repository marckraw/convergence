import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { groupNeedsYou, needsYouCardModel } from '@/features/needs-you'
import type { SessionSummary } from '@/entities/session'
import { NeedsYou } from './needs-you.container'

beforeEach(() => localStorage.clear())
const cards = [
  {
    id: 'pin',
    name: 'Pinned agent',
    providerId: 'claude-code',
    status: 'running',
    pinnedAt: '2026-09-12',
  },
  {
    id: 'failed',
    name: 'Failed agent',
    providerId: 'codex',
    status: 'failed',
    attention: 'failed',
  },
].map((item) =>
  needsYouCardModel(
    {
      model: 'test-model',
      projectId: 'project',
      executionHost: 'local',
      updatedAt: '2026-09-12T12:00:00Z',
      ...item,
    } as SessionSummary,
    {
      projectName: 'Project',
      endpoints: [],
      now: Date.parse('2026-09-12T12:00:00Z'),
    },
  ),
)
const props = {
  groups: groupNeedsYou(cards),
  activeSessionId: null,
  onSelect: vi.fn(),
  onPin: vi.fn(),
  onDismiss: vi.fn(),
  onArchive: vi.fn(),
}

it('starts collapsed, keeps active chips and counts visible when closed, and explains hidden pins', () => {
  render(<NeedsYou {...props} />)
  const control = screen.getByRole('button', { name: 'Filter & sort' })
  expect(control).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(control)
  fireEvent.click(screen.getByText('Status', { selector: 'summary' }))
  const status = screen.getByRole('group', { name: 'Status' })
  fireEvent.click(within(status).getByRole('checkbox', { name: /Failed/ }))
  expect(screen.getByLabelText('1 of 2 cards shown')).toBeInTheDocument()
  expect(
    screen.getByText('1 pinned card hidden by filters.'),
  ).toBeInTheDocument()
  fireEvent.click(control)
  expect(
    screen.getByRole('button', { name: 'Remove Status filter: Failed' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Pinned agent,/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByLabelText('2 of 2 cards shown')).toBeInTheDocument()
})

it('explains an empty result, saves preferences, and resets filtering and presentation', () => {
  const first = render(<NeedsYou {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Filter & sort' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Search cards' }), {
    target: { value: 'missing' },
  })
  expect(screen.getByRole('status')).toHaveTextContent('No cards match')
  first.unmount()
  render(<NeedsYou {...props} />)
  expect(screen.getByRole('status')).toHaveTextContent('No cards match')
  fireEvent.click(screen.getByRole('button', { name: 'Filter & sort' }))
  fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('combobox', { name: 'Sort cards' })).toHaveValue(
    'newest',
  )
  expect(screen.getByLabelText('2 of 2 cards shown')).toBeInTheDocument()
})
