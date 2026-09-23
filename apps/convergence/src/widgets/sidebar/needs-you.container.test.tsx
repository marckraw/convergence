import { fireEvent, render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/shared/ui/tooltip'
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
      createdAt: '2026-09-12T12:00:00Z',
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
    name: 'Edit activity filters: All activity; All hosts · All providers; Order: Created (newest first)',
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
  const name =
    'Edit activity filters: Working; Remote · Anthropic + OpenAI; Order: Created (newest first)'
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
      name: 'Edit activity filters: All activity; Remote · Anthropic; Order: Created (newest first)',
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
      name: 'Edit activity filters: All activity; All hosts · All providers; Order: Created (newest first)',
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
      name: 'Edit activity filters: All activity; All hosts · Anthropic; Order: Created (newest first)',
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
      name: 'Edit activity filters: Working; All hosts · All providers; Order: Created (newest first)',
    }),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('2 of 4 cards shown')).toBeInTheDocument()
})

it('combines workflow choices and treats All activity like All hosts and All providers', () => {
  render(<NeedsYou {...props} />)
  openFilters()
  fireEvent.click(choice('Activity view', 'Working'))
  fireEvent.click(choice('Activity view', 'Review'))
  expect(screen.getByLabelText('3 of 4 cards shown')).toBeInTheDocument()
  for (const label of ['Working', 'Review']) {
    expect(choice('Activity view', label)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  }
  expect(choice('Activity view', 'All activity')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(
    screen.getByRole('button', {
      name: /^Collapse activity filters: Working \+ Review;/,
    }),
  ).toBeInTheDocument()
  fireEvent.click(choice('Activity view', 'Needs me'))
  expect(screen.getByLabelText('4 of 4 cards shown')).toBeInTheDocument()
  fireEvent.click(choice('Activity view', 'All activity'))
  for (const label of ['Working', 'Review', 'Needs me']) {
    expect(choice('Activity view', label)).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  }
  expect(choice('Activity view', 'All activity')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  fireEvent.click(choice('Activity view', 'Working'))
  fireEvent.click(choice('Activity view', 'Review'))
  fireEvent.click(choice('Activity view', 'Working'))
  expect(screen.getByLabelText('1 of 4 cards shown')).toBeInTheDocument()
  fireEvent.click(choice('Activity view', 'Review'))
  expect(choice('Activity view', 'All activity')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByLabelText('4 of 4 cards shown')).toBeInTheDocument()
})

it('migrates a saved single workflow choice and remembers multiple choices and ordering', () => {
  localStorage.setItem(
    'convergence:sidebar-activity-view:v1',
    JSON.stringify({
      version: 2,
      activity: 'working',
      hosts: ['remote'],
      providers: ['openai'],
    }),
  )
  const first = render(<NeedsYou {...props} />)
  openFilters()
  expect(choice('Activity view', 'Working')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(choice('Order by', 'Created')).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(choice('Activity view', 'Review'))
  fireEvent.click(choice('Order by', 'Name'))
  fireEvent.click(screen.getByRole('button', { name: 'Collapse filters' }))
  first.unmount()
  render(<NeedsYou {...props} />)
  expect(
    screen.getByRole('button', {
      name: 'Edit activity filters: Working + Review; Remote · OpenAI; Order: Name (A–Z)',
    }),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('2 of 4 cards shown')).toBeInTheDocument()
  openFilters()
  for (const label of ['Working', 'Review']) {
    expect(choice('Activity view', label)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  }
  expect(choice('Order by', 'Name')).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(
    screen.getByRole('button', { name: 'Clear activity filters' }),
  )
  expect(screen.getByLabelText('4 of 4 cards shown')).toBeInTheDocument()
  expect(choice('Order by', 'Name')).toHaveAttribute('aria-pressed', 'true')
  expect(
    screen.queryByRole('button', { name: 'Clear activity filters' }),
  ).toBeNull()
})

const orderedGroups = (alphaUpdatedAt = '2026-09-12') =>
  groupNeedsYou(
    [
      {
        id: 'alpha',
        name: 'Alpha',
        createdAt: '2026-09-12',
        updatedAt: alphaUpdatedAt,
      },
      {
        id: 'zulu',
        name: 'Zulu',
        createdAt: '2026-09-10',
        updatedAt: '2026-09-14',
      },
    ].map((item) =>
      needsYouCardModel(
        {
          ...cards[2]!.session,
          ...item,
        },
        {
          projectName: 'Project',
          endpoints: [],
          now: Date.parse('2026-09-14'),
        },
      ),
    ),
  )
const visibleOrder = () =>
  screen
    .getAllByRole('button', { name: /^(Alpha|Zulu),/ })
    .map((button) => button.getAttribute('aria-label')!.split(',')[0])

it('keeps stable ordering through live updates and exposes each ordering as a single choice', () => {
  const onSelect = vi.fn()
  const view = render(
    <NeedsYou {...props} groups={orderedGroups()} onSelect={onSelect} />,
  )
  openFilters()
  expect(visibleOrder()).toEqual(['Alpha', 'Zulu'])
  fireEvent.click(choice('Order by', 'Updated'))
  expect(visibleOrder()).toEqual(['Zulu', 'Alpha'])
  expect(choice('Order by', 'Created')).toHaveAttribute('aria-pressed', 'false')
  view.rerender(
    <NeedsYou
      {...props}
      groups={orderedGroups('2026-09-15')}
      onSelect={onSelect}
    />,
  )
  expect(visibleOrder()).toEqual(['Alpha', 'Zulu'])
  for (const label of ['Created', 'Name']) {
    fireEvent.click(choice('Order by', label))
    view.rerender(
      <NeedsYou {...props} groups={orderedGroups()} onSelect={onSelect} />,
    )
    expect(visibleOrder()).toEqual(['Alpha', 'Zulu'])
    expect(choice('Order by', 'Updated')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  }
  fireEvent.click(screen.getByRole('button', { name: /^Alpha,/ }))
  expect(onSelect).toHaveBeenCalledWith('alpha')
})

it('preserves pointer order protection when Updated sorting would swap the clicked card', () => {
  const onSelect = vi.fn()
  const view = render(
    <NeedsYou {...props} groups={orderedGroups()} onSelect={onSelect} />,
  )
  openFilters()
  fireEvent.click(choice('Order by', 'Updated'))
  const working = screen.getByRole('region', { name: 'Working' })
  fireEvent.pointerEnter(working)
  view.rerender(
    <NeedsYou
      {...props}
      groups={orderedGroups('2026-09-15')}
      onSelect={onSelect}
    />,
  )
  expect(visibleOrder()).toEqual(['Zulu', 'Alpha'])
  expect(
    screen.getByRole('button', { name: 'Order paused · Update order' }),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Zulu,/ }))
  expect(onSelect).toHaveBeenCalledWith('zulu')
  fireEvent.pointerLeave(working)
  expect(visibleOrder()).toEqual(['Alpha', 'Zulu'])
})

const sectionToggle = (title: string) =>
  within(screen.getByRole('region', { name: title })).getByRole('button', {
    name: title,
  })

it('MAR-3366 R3 folds a section, keeps the others open, and stays folded through a remount — mutation: do not persist turns red', () => {
  const first = render(<NeedsYou {...props} />, { wrapper: TooltipProvider })
  expect(sectionToggle('Working')).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(sectionToggle('Working'))
  expect(sectionToggle('Working')).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: /^Remote agent,/ })).toBeNull()
  expect(
    screen.getByRole('button', { name: /^Finished agent,/ }),
  ).toBeInTheDocument()
  expect(sectionToggle('Review')).toHaveAttribute('aria-expanded', 'true')
  first.unmount()
  const second = render(<NeedsYou {...props} />, { wrapper: TooltipProvider })
  expect(sectionToggle('Working')).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: /^Remote agent,/ })).toBeNull()
  fireEvent.click(sectionToggle('Working'))
  expect(
    screen.getByRole('button', { name: /^Remote agent,/ }),
  ).toBeInTheDocument()
  second.unmount()
  render(<NeedsYou {...props} />, { wrapper: TooltipProvider })
  expect(sectionToggle('Working')).toHaveAttribute('aria-expanded', 'true')
})

it('MAR-3366 R3 a stored fold that is not a JSON list folds nothing', () => {
  localStorage.setItem('convergence:sidebar-activity-folded:v1', 'not json')
  render(<NeedsYou {...props} />, { wrapper: TooltipProvider })
  for (const title of ['Pinned', 'Needs attention', 'Review', 'Working'])
    expect(sectionToggle(title)).toHaveAttribute('aria-expanded', 'true')
})

it('MAR-3366 R3 folding keeps the feed order and the filters untouched', () => {
  render(<NeedsYou {...props} />, { wrapper: TooltipProvider })
  const titles = () =>
    screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label'))
  const before = titles()
  expect(before).toEqual(['Pinned', 'Needs attention', 'Review', 'Working'])
  fireEvent.click(sectionToggle('Review'))
  expect(titles()).toEqual(before)
  expect(screen.getByLabelText('4 of 4 cards shown')).toBeInTheDocument()
})

it('MAR-3366 R3 a fold and a filter persist side by side — mutation: store the fold under the view key turns red', () => {
  const first = render(<NeedsYou {...props} />, { wrapper: TooltipProvider })
  openFilters()
  fireEvent.click(choice('Provider filters', 'OpenAI'))
  fireEvent.click(screen.getByRole('button', { name: 'Collapse filters' }))
  fireEvent.click(sectionToggle('Working'))
  first.unmount()
  render(<NeedsYou {...props} />, { wrapper: TooltipProvider })
  expect(screen.getByLabelText('3 of 4 cards shown')).toBeInTheDocument()
  expect(sectionToggle('Working')).toHaveAttribute('aria-expanded', 'false')
})
