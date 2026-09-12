import { fireEvent, render, screen } from '@testing-library/react'
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
