import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import { buildSessionCards } from './mission-control-cards.pure'
import { SessionCardView } from './session-card.presentational'
import {
  classifySessionCardState,
  formatSessionCardState,
} from './session-card-state.pure'
function summary(): SessionSummary {
  return {
    id: 's',
    contextKind: 'global',
    projectId: null,
    workspaceId: null,
    providerId: 'codex',
    model: null,
    effort: null,
    name: 'Horse',
    status: 'failed',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/repo',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-09-15T12:00:00Z',
    updatedAt: '2026-09-15T12:00:00Z',
    executionHost: 'lm',
    executionHostLastEventAt: '2026-09-15T11:58:30Z',
  }
}
it.each(['lm', 'local'])(
  'RUN84 %s Mission Control host clock — mutation use viewer time turns red',
  (host) => {
    const session = summary()
    session.executionHost = host
    const [card] = buildSessionCards({
      sessions: [session],
      projects: [],
      providers: [],
      now: Date.parse('2026-09-15T12:00:00Z'),
    })
    render(
      <SessionCardView
        card={card}
        hailOpen={false}
        onOpen={vi.fn()}
        onHail={vi.fn()}
      />,
    )
    if (host === 'lm')
      expect(screen.getByText('host · 1m ago')).toBeInTheDocument()
    else expect(screen.queryByText(/host ·/)).toBeNull()
  },
)
it('RUN84 host-unreachable has its own state — mutation map to failed turns red', () => {
  const session = summary()
  Object.assign(session, { attention: 'host-unreachable' })
  const [card] = buildSessionCards({
    sessions: [session],
    projects: [],
    providers: [],
    now: Date.parse('2026-09-15T12:00:00Z'),
  })
  expect(formatSessionCardState(classifySessionCardState(card))).toBe(
    'Host unreachable',
  )
  render(
    <SessionCardView
      card={card}
      hailOpen={false}
      onOpen={vi.fn()}
      onHail={vi.fn()}
    />,
  )
  expect(screen.getByText('Host unreachable')).toBeInTheDocument()
  expect(screen.queryByText('Failed')).toBeNull()
})
