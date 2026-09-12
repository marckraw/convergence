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
  'renders %s metadata and named tooltips without fetching',
  async (_name, session) => {
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
    expect(screen.getByText('gpt-6')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'OpenAI' })).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: session.executionHost === 'lm' ? 'little-monster' : 'laptop',
      }),
    ).toBeInTheDocument()
    const hostIcon = screen.getByRole('img', {
      name: session.executionHost === 'lm' ? 'little-monster' : 'laptop',
    })
    fireEvent.focus(hostIcon)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(card.host)
    fireEvent.blur(hostIcon)
    const providerIcon = screen.getByRole('img', { name: 'OpenAI' })
    fireEvent.focus(providerIcon)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('OpenAI')
    fireEvent.blur(providerIcon)
    expect(screen.getByTitle(session.updatedAt)).toHaveTextContent('5 m ago')
    if (session.pullRequest)
      expect(
        screen.getByText(`#42 · ${session.pullRequest.state}`),
      ).toBeInTheDocument()
    else expect(screen.queryByText(/#42/)).toBeNull()
    if (session.originKind === null) {
      expect(screen.queryByRole('img', { name: 'Resident' })).toBeNull()
      expect(screen.queryByRole('img', { name: 'Errand' })).toBeNull()
    } else {
      const label =
        session.originKind === 'spawn' ||
        session.workAddress?.mode === 'repository'
          ? 'Errand'
          : 'Resident'
      const kindIcon = screen.getByRole('img', { name: label })
      fireEvent.focus(kindIcon)
      expect(await screen.findByRole('tooltip')).toHaveTextContent(label)
      fireEvent.blur(kindIcon)
    }
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
it('dismisses a review item without selecting it (mutation: route dismiss to onSelect)', () => {
  const handlers = actions()
  const card = needsYouCardModel(cardFixtures.noPr, cardContext)
  render(<NeedsYouCard card={card} {...handlers} />)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for Horse' }), {
    key: 'Enter',
  })
  fireEvent.click(screen.getByRole('menuitem', { name: card.dismissLabel! }))
  expect(handlers.onDismiss).toHaveBeenCalledExactlyOnceWith('no-pr')
  expect(handlers.onSelect).not.toHaveBeenCalled()
})
