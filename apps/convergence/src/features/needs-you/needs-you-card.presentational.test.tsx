import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import {
  cardContext,
  cardFixtures,
  cardSession,
} from './needs-you-card.fixture'
import { needsYouCardModel } from './needs-you-card.pure'
import { NeedsYouCard } from './needs-you-card.presentational'
import { SessionActivityCard } from './session-activity-card.presentational'
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
    if (session.executionHost === 'lm')
      expect(screen.getByText('host · not recorded')).toBeInTheDocument()
    else
      expect(screen.getByTitle(session.updatedAt)).toHaveTextContent('5 m ago')
    if (session.pullRequest)
      expect(
        screen.getByRole('link', { name: /Pull request #42/ }),
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
it('opens the PR independently of selecting the conversation', () => {
  const handlers = actions()
  render(
    <NeedsYouCard
      card={needsYouCardModel(cardFixtures.open, cardContext)}
      {...handlers}
    />,
  )
  const link = screen.getByRole('link', { name: /Pull request #42/ })
  expect(link.closest('button')).toBeNull()
  expect(link).toHaveAttribute('href', cardFixtures.open.pullRequest!.url)
  fireEvent.click(link)
  expect(handlers.onSelect).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Horse, Convergence' }))
  expect(handlers.onSelect).toHaveBeenCalledWith('open')
})
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

it.each([
  cardFixtures.noPr,
  cardSession({ id: 'failed', status: 'failed', attention: 'failed' }),
])(
  'exposes independent review buttons on $id without opening the menu',
  (session) => {
    const handlers = actions()
    render(
      <NeedsYouCard
        card={needsYouCardModel(session, cardContext)}
        {...handlers}
      />,
    )

    expect(
      screen.getByRole('group', { name: 'Review actions for Horse' }),
    ).toBeVisible()
    const acknowledge = screen.getByRole('button', { name: 'Acknowledge' })
    const archive = screen.getByRole('button', { name: 'Archive' })
    expect(acknowledge.parentElement?.closest('button')).toBeNull()
    expect(archive.parentElement?.closest('button')).toBeNull()
    acknowledge.focus()
    expect(acknowledge).toHaveFocus()
    fireEvent.click(acknowledge)
    expect(handlers.onDismiss).toHaveBeenCalledExactlyOnceWith(session.id)
    expect(handlers.onArchive).not.toHaveBeenCalled()
    archive.focus()
    expect(archive).toHaveFocus()
    fireEvent.click(archive)
    expect(handlers.onArchive).toHaveBeenCalledExactlyOnceWith(session.id)
    expect(handlers.onSelect).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  },
)

it.each([
  [cardFixtures.working, null],
  [cardFixtures.waiting, 'Snooze'],
  [cardFixtures.open, null],
  [cardFixtures.merged, 'Archive'],
  [cardSession({ status: 'running', attention: 'finished' }), null],
  [cardSession({ status: 'answered', attention: 'finished' }), null],
  [cardSession({ attention: 'needs-approval' }), 'Snooze'],
] as const)(
  'RUN84 lap3 non-review footer obeys the offered action — mutation gate on group turns red (%s)',
  (session, offeredAction) => {
    render(
      <NeedsYouCard
        card={needsYouCardModel(session, cardContext)}
        {...actions()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    if (offeredAction)
      expect(screen.getByRole('button', { name: offeredAction })).toBeVisible()
    else
      expect(
        screen.queryByRole('group', { name: 'Review actions for Horse' }),
      ).toBeNull()
    if (offeredAction !== 'Archive')
      expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
  },
)

it('keeps Archive available after acknowledging a pinned review card', () => {
  const session = { ...cardFixtures.noPr, pinnedAt: '2026-09-12T12:00:00Z' }
  const handlers = actions()
  const view = render(
    <NeedsYouCard
      card={needsYouCardModel(session, cardContext)}
      {...handlers}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
  view.rerender(
    <NeedsYouCard
      card={needsYouCardModel(session, { ...cardContext, dismissed: true })}
      {...handlers}
    />,
  )
  expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
  expect(handlers.onArchive).toHaveBeenCalledExactlyOnceWith(session.id)
  expect(handlers.onSelect).not.toHaveBeenCalled()
})

it('retains Snooze in the waiting card menu', () => {
  const handlers = actions()
  render(
    <NeedsYouCard
      card={needsYouCardModel(cardFixtures.waiting, cardContext)}
      {...handlers}
    />,
  )
  fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for Horse' }), {
    key: 'Enter',
  })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Snooze' }))
  expect(handlers.onDismiss).toHaveBeenCalledExactlyOnceWith('waiting')
  expect(handlers.onSelect).not.toHaveBeenCalled()
})

it('does not add review actions to other surfaces using the shared card', () => {
  render(
    <SessionActivityCard
      card={needsYouCardModel(cardFixtures.noPr, cardContext)}
      actions={<button type="button">Other surface actions</button>}
      onSelect={vi.fn()}
    />,
  )
  expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Other surface actions' }),
  ).toBeVisible()
})

it.each(['lm', 'local'])(
  'RUN84 %s card reads host time — mutation read updatedAt turns red',
  (executionHost) => {
    const session = cardSession({
      executionHost,
      executionHostLastEventAt: '2026-09-15T11:58:30Z',
      updatedAt: '2026-09-15T12:00:00Z',
    })
    render(
      <NeedsYouCard
        card={needsYouCardModel(session, {
          ...cardContext,
          now: Date.parse('2026-09-15T12:00:00Z'),
        })}
        {...actions()}
      />,
    )
    if (executionHost === 'lm')
      expect(screen.getByText('host · 1m ago')).toBeInTheDocument()
    else expect(screen.queryByText(/host ·/)).toBeNull()
  },
)
it('RUN84 unreachable is not Failed — mutation classify unreachable as failed turns red', () => {
  const session = cardSession({ status: 'failed' })
  // RUN82 adds this wire attention; do not widen its owned union here.
  Object.assign(session, { attention: 'host-unreachable' })
  render(
    <NeedsYouCard
      card={needsYouCardModel(session, cardContext)}
      {...actions()}
    />,
  )
  expect(screen.getByText('Host unreachable')).toBeInTheDocument()
  expect(screen.queryByText('Failed')).toBeNull()
})

it('RUN84 compact remote card keeps host clock and unreachable label — mutation hide compact evidence turns red', () => {
  const session = cardSession({
    executionHost: 'lm',
    status: 'failed',
    executionHostLastEventAt: '2026-09-15T11:58:30Z',
  })
  Object.assign(session, { attention: 'host-unreachable' })
  render(
    <SessionActivityCard
      actions={null}
      compact
      card={needsYouCardModel(session, {
        ...cardContext,
        now: Date.parse('2026-09-15T12:00:00Z'),
      })}
      onSelect={vi.fn()}
    />,
  )
  expect(screen.getByText('host · 1m ago')).toBeInTheDocument()
  expect(screen.getByText('Host unreachable')).toBeInTheDocument()
})

it.each(['host-unreachable', 'finished'] as const)(
  'RUN84 lap3 footer follows flags for %s — mutation key footer on group turns red',
  (attention) => {
    const session = cardSession({
      status: attention === 'finished' ? 'completed' : 'running',
    })
    Object.assign(session, { attention })
    render(
      <NeedsYouCard
        card={needsYouCardModel(session, cardContext)}
        {...actions()}
      />,
    )
    if (attention === 'finished') {
      expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeVisible()
      expect(screen.getByRole('button', { name: 'Archive' })).toBeVisible()
    } else {
      expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    }
  },
)
