import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { groupNeedsYou, needsYouCardModel } from '@/features/needs-you'
import type { SessionSummary } from '@/entities/session'
import { NeedsYou } from './needs-you.container'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())
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
  {
    id: 'remote',
    name: 'Remote agent',
    providerId: 'codex',
    status: 'running',
    executionHost: 'lm',
  },
  {
    id: 'review',
    name: 'Finished agent',
    providerId: 'codex',
    status: 'completed',
    attention: 'finished',
    executionHost: 'other-server',
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
const choice = (group: string, name: string) =>
  within(screen.getByRole('group', { name: group })).getByRole('button', {
    name,
  })
const openFilters = () =>
  fireEvent.click(
    screen.getByRole('button', { name: /^Edit activity filters:/ }),
  )

it('starts with a readable collapsed summary and opens the existing controls', () => {
  render(<NeedsYou {...props} />)
  const trigger = screen.getByRole('button', {
    name: 'Edit activity filters: All activity; All hosts · All providers',
  })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(
    document.getElementById(trigger.getAttribute('aria-controls')!),
  ).not.toBeVisible()
  expect(screen.queryByRole('group', { name: 'Activity view' })).toBeNull()
  expect(screen.getByRole('region', { name: 'Pinned' })).toBeInTheDocument()
  openFilters()
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  for (const name of ['All activity', 'Needs me', 'Working', 'Review'])
    expect(choice('Activity view', name)).toBeInTheDocument()
  expect(choice('Activity view', 'All activity')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Filter & sort' })).toBeNull()
  expect(
    screen.queryByRole('button', { name: 'Clear activity filters' }),
  ).toBeNull()
})

it('filters attention, explains hidden pins, and clears without selecting or unpinning a session', () => {
  render(<NeedsYou {...props} />)
  openFilters()
  fireEvent.click(choice('Activity view', 'Needs me'))
  expect(screen.getByLabelText('1 of 4 cards shown')).toBeInTheDocument()
  expect(
    screen.getByText('1 pinned card hidden by filters.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Pinned agent,/ })).toBeNull()
  expect(props.onSelect).not.toHaveBeenCalled()
  expect(props.onPin).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Clear activity filters' }),
  )
  expect(screen.getByLabelText('4 of 4 cards shown')).toBeInTheDocument()
  expect(choice('Activity view', 'All activity')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

it('combines provider and all-remote toggles, retaining recoverable zero-result choices', () => {
  render(<NeedsYou {...props} />)
  openFilters()
  fireEvent.click(choice('Host filters', 'Remote · All remote hosts'))
  expect(screen.getByLabelText('2 of 4 cards shown')).toBeInTheDocument()
  fireEvent.click(choice('Provider filters', 'Anthropic'))
  expect(screen.getByRole('status')).toHaveTextContent('No activity matches')
  expect(choice('Provider filters', 'Anthropic')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  fireEvent.click(choice('Provider filters', 'OpenAI'))
  expect(screen.getByLabelText('2 of 4 cards shown')).toBeInTheDocument()
  fireEvent.click(choice('Activity view', 'Working'))
  expect(screen.getByLabelText('1 of 4 cards shown')).toBeInTheDocument()
  fireEvent.click(choice('Provider filters', 'All providers'))
  expect(choice('Provider filters', 'Anthropic')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(choice('Host filters', 'Remote · All remote hosts')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

it('restores only the new controls and resets legacy hidden filters', () => {
  localStorage.setItem(
    'convergence:sidebar-activity-view:v1',
    JSON.stringify({
      query: 'missing',
      filters: { project: ['hidden'] },
      sort: 'name-desc',
    }),
  )
  const first = render(<NeedsYou {...props} />)
  expect(screen.getByLabelText('4 of 4 cards shown')).toBeInTheDocument()
  openFilters()
  fireEvent.click(choice('Provider filters', 'OpenAI'))
  first.unmount()
  render(<NeedsYou {...props} />)
  expect(choice('Provider filters', 'OpenAI')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByLabelText('3 of 4 cards shown')).toBeInTheDocument()
})

it('keeps a selected provider visible after its cards disappear', () => {
  const view = render(<NeedsYou {...props} />)
  openFilters()
  fireEvent.click(choice('Provider filters', 'Anthropic'))
  view.rerender(<NeedsYou {...props} groups={[]} />)
  expect(choice('Provider filters', 'Anthropic')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByLabelText('0 of 0 cards shown')).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Clear activity filters' }),
  )
  expect(screen.getByRole('status')).toHaveTextContent('No activity cards yet.')
})

it('shows provider names on keyboard focus', async () => {
  render(<NeedsYou {...props} />)
  openFilters()
  fireEvent.focus(choice('Provider filters', 'OpenAI'))
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'OpenAI · 3 conversations',
  )
})

it('keeps filter selections and the collapsed preference through a remount', () => {
  const first = render(<NeedsYou {...props} />)
  openFilters()
  fireEvent.click(choice('Activity view', 'Working'))
  fireEvent.click(choice('Host filters', 'Remote · All remote hosts'))
  fireEvent.click(choice('Provider filters', 'OpenAI'))
  fireEvent.click(choice('Provider filters', 'Anthropic'))
  fireEvent.click(screen.getByRole('button', { name: 'Collapse filters' }))
  const name = 'Edit activity filters: Working; Remote · Anthropic + OpenAI'
  expect(screen.getByRole('button', { name })).toHaveFocus()
  expect(screen.getByLabelText('1 of 4 cards shown')).toBeInTheDocument()
  first.unmount()
  render(<NeedsYou {...props} />)
  expect(screen.getByRole('button', { name })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  openFilters()
  expect(choice('Activity view', 'Working')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(choice('Host filters', 'Remote · All remote hosts')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(choice('Provider filters', 'OpenAI')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(choice('Provider filters', 'Anthropic')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

it('keeps empty-result recovery and hidden pinned-card information visible while collapsed', () => {
  render(<NeedsYou {...props} />)
  openFilters()
  fireEvent.click(choice('Host filters', 'Remote · All remote hosts'))
  fireEvent.click(choice('Provider filters', 'Anthropic'))
  fireEvent.click(screen.getByRole('button', { name: 'Collapse filters' }))
  expect(
    screen.getByRole('button', {
      name: 'Edit activity filters: All activity; Remote · Anthropic',
    }),
  ).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('No activity matches')
  expect(screen.getByText('1 pinned card hidden by filters.')).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Clear activity filters' }),
  )
  expect(screen.getByLabelText('4 of 4 cards shown')).toBeInTheDocument()
  expect(
    screen.getByRole('button', {
      name: 'Edit activity filters: All activity; All hosts · All providers',
    }),
  ).toHaveFocus()
  expect(screen.queryByRole('group', { name: 'Activity view' })).toBeNull()
})

it('keeps a selected provider in the collapsed summary when its activity disappears', () => {
  const view = render(<NeedsYou {...props} />)
  openFilters()
  fireEvent.click(choice('Provider filters', 'Anthropic'))
  fireEvent.click(screen.getByRole('button', { name: 'Collapse filters' }))
  view.rerender(<NeedsYou {...props} groups={[]} />)
  expect(
    screen.getByRole('button', {
      name: 'Edit activity filters: All activity; All hosts · Anthropic',
    }),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('0 of 0 cards shown')).toBeInTheDocument()
})

it('collapses with Escape and returns focus to the summary', () => {
  render(<NeedsYou {...props} />)
  openFilters()
  const working = choice('Activity view', 'Working')
  working.focus()
  fireEvent.keyDown(working, { key: 'Escape' })
  expect(
    screen.getByRole('button', {
      name: /^Edit activity filters:/,
    }),
  ).toHaveFocus()
  expect(screen.queryByRole('group', { name: 'Activity view' })).toBeNull()
})

it('supports filtering and collapsing when preference storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  render(<NeedsYou {...props} />)
  openFilters()
  fireEvent.click(choice('Activity view', 'Working'))
  fireEvent.click(screen.getByRole('button', { name: 'Collapse filters' }))
  expect(
    screen.getByRole('button', {
      name: 'Edit activity filters: Working; All hosts · All providers',
    }),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('2 of 4 cards shown')).toBeInTheDocument()
})
