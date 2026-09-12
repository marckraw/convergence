import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { groupNeedsYou, needsYouCardModel } from '@/features/needs-you'
import { NeedsYou } from './needs-you.presentational'
import type { SessionSummary } from '@/entities/session'
it('renders feed groups once and routes selection (mutation: duplicate a pinned review)', () => {
  const session = {
    id: 's',
    name: 'Horse',
    providerId: 'codex',
    model: 'gpt-6',
    pinnedAt: '2026-09-12',
    attention: 'finished',
    updatedAt: '2026-09-12T12:00:00Z',
  } as SessionSummary
  const card = needsYouCardModel(session, {
    projectName: 'Project',
    endpoints: [],
    now: Date.parse(session.updatedAt),
  })
  const select = vi.fn()
  render(
    <NeedsYou
      groups={groupNeedsYou([card, card])}
      activeSessionId={null}
      onSelect={select}
      onPin={vi.fn()}
      onDismiss={vi.fn()}
      onArchive={vi.fn()}
    />,
  )
  expect(screen.getByRole('region', { name: 'Pinned' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Needs review' })).toBeNull()
  fireEvent.click(
    screen.getByRole('button', { name: 'Horse, Finished, Project' }),
  )
  expect(select).toHaveBeenCalledExactlyOnceWith('s')
})

it('shows a counted Working section and moves a finished session into review', () => {
  const session = {
    id: 'running',
    name: 'Active horse',
    providerId: 'codex',
    model: 'gpt-5.5',
    status: 'running',
    attention: 'none',
    updatedAt: '2026-09-12T12:00:00Z',
  } as SessionSummary
  const groups = (value: SessionSummary) =>
    groupNeedsYou([
      needsYouCardModel(value, {
        projectName: 'Project',
        endpoints: [],
        now: Date.parse(value.updatedAt),
      }),
    ])
  const props = {
    activeSessionId: null,
    onSelect: vi.fn(),
    onPin: vi.fn(),
    onDismiss: vi.fn(),
    onArchive: vi.fn(),
  }
  const { rerender } = render(<NeedsYou groups={groups(session)} {...props} />)
  const section = screen.getByRole('region', { name: 'Working' })
  expect(within(section).getByRole('heading')).toHaveTextContent('Working1')
  fireEvent.click(
    within(section).getByRole('button', {
      name: 'Active horse, Working, Project',
    }),
  )
  expect(props.onSelect).toHaveBeenCalledExactlyOnceWith('running')
  rerender(
    <NeedsYou
      groups={groups({ ...session, status: 'idle', attention: 'finished' })}
      {...props}
    />,
  )
  expect(screen.queryByRole('region', { name: 'Working' })).toBeNull()
  expect(
    within(screen.getByRole('region', { name: 'Needs review' })).getByText(
      'Finished',
    ),
  ).toBeInTheDocument()
})
