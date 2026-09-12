import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { cardContext, cardFixtures } from './needs-you-card.fixture'
import { needsYouCardModel } from './needs-you-card.pure'
import { NeedsYouCard } from './needs-you-card.presentational'
const actions = () => ({
  onSelect: vi.fn(),
  onPin: vi.fn(),
  onDismiss: vi.fn(),
  onArchive: vi.fn(),
})
it.each(Object.entries(cardFixtures))(
  'renders %s from the summary, without fetching (mutation: remove a chip)',
  (_name, session) => {
    const fetch = vi.fn(() => {
      throw new Error('a card must not fetch')
    })
    vi.stubGlobal('electronAPI', {
      pullRequest: { getForSession: fetch, refreshForSession: fetch },
    })
    const card = needsYouCardModel(session, cardContext)
    render(<NeedsYouCard card={card} {...actions()} />)
    expect(screen.getByText('Horse')).toBeInTheDocument()
    expect(screen.getByText('Convergence')).toBeInTheDocument()
    expect(screen.getByText('codex · gpt-6')).toBeInTheDocument()
    expect(
      screen.getByText(
        session.executionHost === 'lm' ? 'little-monster' : 'laptop',
      ),
    ).toBeInTheDocument()
    expect(screen.getByTitle(session.updatedAt)).toHaveTextContent('5 m ago')
    if (session.pullRequest)
      expect(
        screen.getByText(`#42 · ${session.pullRequest.state}`),
      ).toBeInTheDocument()
    else expect(screen.queryByText(/#42/)).toBeNull()
    if (session.originKind === null) {
      expect(screen.queryByText('resident')).toBeNull()
      expect(screen.queryByText('errand')).toBeNull()
    } else
      expect(
        screen.getByText(
          session.originKind === 'spawn' ||
            session.workAddress?.mode === 'repository'
            ? 'errand'
            : 'resident',
        ),
      ).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  },
)
it.each(['open', 'merged'] as const)(
  '%s errand menu obeys archive law and pins (mutation: archive an open PR)',
  (kind) => {
    const handlers = actions()
    render(
      <NeedsYouCard
        card={needsYouCardModel(cardFixtures[kind], cardContext)}
        {...handlers}
      />,
    )
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Actions for Horse' }),
      { key: 'Enter' },
    )
    if (kind === 'merged') {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
      expect(handlers.onArchive).toHaveBeenCalledWith('merged')
    } else {
      expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }))
      expect(handlers.onPin).toHaveBeenCalledWith('open', true)
    }
  },
)
