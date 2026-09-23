import { fireEvent, render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { expect, it, vi } from 'vitest'
import {
  cardStateTone,
  groupNeedsYou,
  needsYouCardModel,
} from '@/features/needs-you'
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

const liveNow = Date.parse('2026-09-12T12:05:00Z')
function runningCard(id: string, minutes: number, providerId: string) {
  return needsYouCardModel(
    {
      id,
      name: `Horse ${id}`,
      providerId,
      model: 'm',
      status: 'running',
      attention: 'none',
      hasActiveHandle: true,
      turnTiming: {
        status: 'running',
        startedAt: new Date(liveNow - minutes * 60_000).toISOString(),
        endedAt: null,
      },
      updatedAt: '2026-09-12T12:00:00Z',
    } as SessionSummary,
    { projectName: 'Project', endpoints: [], now: liveNow },
  )
}
const feedProps = {
  activeSessionId: null,
  onSelect: vi.fn(),
  onPin: vi.fn(),
  onDismiss: vi.fn(),
  onArchive: vi.fn(),
}

it('MAR-3366 R2 marks only the Pinned section as special — mutation: apply the marker to every section turns red', () => {
  const pinned = needsYouCardModel(
    {
      id: 'p',
      name: 'Mine',
      providerId: 'codex',
      model: 'm',
      pinnedAt: '2026-09-12',
      updatedAt: '2026-09-12T12:00:00Z',
    } as SessionSummary,
    { projectName: 'Project', endpoints: [], now: liveNow },
  )
  render(
    <NeedsYou
      groups={groupNeedsYou([pinned, runningCard('w', 2, 'codex')])}
      {...feedProps}
    />,
    { wrapper: TooltipProvider },
  )
  const pinnedSection = screen.getByRole('region', { name: 'Pinned' })
  const working = screen.getByRole('region', { name: 'Working' })
  expect(pinnedSection).toHaveAttribute('data-section-kind', 'pinned')
  expect(
    within(pinnedSection)
      .getByRole('heading')
      .querySelector('[data-section-pin]'),
  ).not.toBeNull()
  expect(working).not.toHaveAttribute('data-section-kind')
  expect(
    within(working).getByRole('heading').querySelector('[data-section-pin]'),
  ).toBeNull()
})

it('MAR-3366 R4 a folded section shows count, one glyph per card and its line; an unfolded one only title and count — mutation: show the strip when unfolded turns red', () => {
  const working = [
    runningCard('a', 3, 'codex'),
    runningCard('b', 52, 'claude-code'),
    runningCard('c', 12, 'codex'),
    runningCard('d', 1, 'claude-code'),
  ]
  const review = needsYouCardModel(
    {
      id: 'r',
      name: 'Done',
      providerId: 'codex',
      model: 'm',
      status: 'completed',
      attention: 'finished',
      updatedAt: '2026-09-12T12:00:00Z',
    } as SessionSummary,
    { projectName: 'Project', endpoints: [], now: liveNow },
  )
  render(
    <NeedsYou
      groups={groupNeedsYou([...working, review])}
      foldedTitles={new Set(['Working'])}
      {...feedProps}
    />,
    { wrapper: TooltipProvider },
  )
  const folded = screen.getByRole('region', { name: 'Working' })
  const heading = within(folded).getByRole('heading')
  expect(
    within(heading).getByRole('button', { name: 'Working' }),
  ).toHaveAttribute('aria-expanded', 'false')
  expect(heading.querySelectorAll('[data-fold-glyph]')).toHaveLength(4)
  expect(heading).toHaveTextContent('longest 52m 0s')
  expect(heading).toHaveTextContent(/4$/)
  expect(
    within(heading).getByRole('img', {
      name: 'Horse a, Horse b, Horse c, Horse d',
    }),
  ).toBeInTheDocument()
  expect(within(folded).queryByRole('button', { name: /^Horse a,/ })).toBeNull()
  const open = screen.getByRole('region', { name: 'Needs review' })
  expect(within(open).getByRole('heading')).toHaveTextContent(/^Needs review1$/)
  expect(open.querySelector('[data-fold-glyphs]')).toBeNull()
  expect(
    within(open).getByRole('button', { name: 'Needs review' }),
  ).toHaveAttribute('aria-expanded', 'true')
})

it('MAR-3366 R4 a folded section draws six glyphs and +N for the rest', () => {
  const cards = Array.from({ length: 9 }, (_, index) =>
    runningCard(String(index), index + 1, 'codex'),
  )
  render(
    <NeedsYou
      groups={groupNeedsYou(cards)}
      foldedTitles={new Set(['Working'])}
      {...feedProps}
    />,
    { wrapper: TooltipProvider },
  )
  const heading = within(
    screen.getByRole('region', { name: 'Working' }),
  ).getByRole('heading')
  expect(heading.querySelectorAll('[data-fold-glyph]')).toHaveLength(6)
  expect(heading).toHaveTextContent('+3')
})

it('MAR-3366 R6 a folded glyph carries its card state tone — mutation: the strip ignores the state turns red', () => {
  const failed = needsYouCardModel(
    {
      id: 'f',
      name: 'Broken',
      providerId: 'codex',
      model: 'm',
      status: 'failed',
      attention: 'failed',
      pinnedAt: '2026-09-12',
      updatedAt: '2026-09-12T12:00:00Z',
    } as SessionSummary,
    { projectName: 'Project', endpoints: [], now: liveNow },
  )
  const working = needsYouCardModel(
    { ...runningCard('w', 5, 'claude-code').session, pinnedAt: '2026-09-12' },
    { projectName: 'Project', endpoints: [], now: liveNow },
  )
  render(
    <NeedsYou
      groups={groupNeedsYou([failed, working])}
      foldedTitles={new Set(['Pinned'])}
      {...feedProps}
    />,
    { wrapper: TooltipProvider },
  )
  const heading = within(
    screen.getByRole('region', { name: 'Pinned' }),
  ).getByRole('heading')
  const icon = (state: string) =>
    heading.querySelector(`[data-fold-glyph][data-state="${state}"] > span`)
  expect(cardStateTone.failed).not.toEqual(cardStateTone.working)
  expect(icon('failed')).toHaveClass(...cardStateTone.failed.split(' '))
  expect(icon('failed')).not.toHaveClass(...cardStateTone.working.split(' '))
  expect(icon('working')).toHaveClass(...cardStateTone.working.split(' '))
  expect(icon('working')).not.toHaveClass(cardStateTone.failed)
})
