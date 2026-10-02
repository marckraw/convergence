import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@convergence/ui'
import {
  SESSION_STATE_TONE,
  SessionStateBadge,
  type SessionSummary,
  type SessionToneState,
} from '@/entities/session'
import { SessionCardView } from '@/features/mission-control'
import { NeedsYouCard, needsYouCardModel } from '@/features/needs-you'

/**
 * One session state, one tone, on every surface that draws it (NAV-1, MC-1):
 * the sidebar's row glyph (SessionStateBadge), the Activity feed's card status
 * and Mission Control's card. Each surface marks its state glyph with
 * `data-tone`; this walk reads them, so a surface that paints a state its own
 * way (the muted working spinner, the muted unreachable glyph) turns it red.
 */

const NOW = Date.parse('2026-10-02T12:05:00Z')

function session(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    id: 'walk',
    contextKind: 'project',
    projectId: 'project',
    workspaceId: null,
    providerId: 'codex',
    model: 'gpt-6',
    effort: 'high',
    name: 'Walk',
    status: 'idle',
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
    createdAt: '2026-10-02T12:00:00Z',
    updatedAt: '2026-10-02T12:00:00Z',
    executionHost: 'local',
    originKind: 'resident',
    pinnedAt: null,
    ...overrides,
  }
}

/** Each state the three surfaces share, as the record says it. */
const STATES: ReadonlyArray<[SessionToneState, Partial<SessionSummary>]> = [
  ['working', { status: 'running' }],
  ['waiting', { status: 'idle', attention: 'needs-input' }],
  ['finished', { status: 'completed', attention: 'finished' }],
  ['failed', { status: 'failed', attention: 'failed' }],
  ['unreachable', { status: 'running', attention: 'host-unreachable' }],
]

/** The tones a surface's state glyphs wear, read from the DOM. */
function tonesIn(root: Element): string[] {
  return [...root.querySelectorAll('[data-tone]')].map(
    (node) => node.getAttribute('data-tone') ?? '',
  )
}

function sidebarRow(record: SessionSummary): string[] {
  const { container } = render(<SessionStateBadge session={record} />)
  return tonesIn(container)
}

function activityCard(record: SessionSummary): string[] {
  const card = needsYouCardModel(record, {
    projectName: 'Convergence',
    endpoints: [],
    now: NOW,
  })
  const { container } = render(
    <NeedsYouCard
      card={card}
      onSelect={() => {}}
      onPin={() => {}}
      onDismiss={() => {}}
      onArchive={() => {}}
    />,
    { wrapper: TooltipProvider },
  )
  return tonesIn(container)
}

function missionControlCard(record: SessionSummary): string[] {
  const { container } = render(
    <SessionCardView
      card={{
        session: record,
        projectName: 'Convergence',
        providerLabel: 'Codex',
        activityLabel: record.status === 'running' ? 'working' : 'idle',
        crews: [],
        searchText: 'walk',
      }}
      open={false}
      hailOpen={false}
      onOpen={() => {}}
      onHail={() => {}}
    />,
    { wrapper: TooltipProvider },
  )
  return tonesIn(container)
}

describe('a session state wears one tone on every surface (NAV-1, MC-1)', () => {
  it.each(STATES)(
    '%s: the sidebar row, the Activity card and the Mission Control card agree',
    (state, overrides) => {
      const record = session(overrides)
      const tone = SESSION_STATE_TONE[state]
      for (const [surface, tones] of [
        ['sidebar row', sidebarRow(record)],
        ['Activity card', activityCard(record)],
        ['Mission Control card', missionControlCard(record)],
      ] as const) {
        // Every surface draws the state, and draws it in no other tone.
        // Mutation: paint the working spinner muted again, or the unreachable
        // glyph without its tone, on any one surface -> red.
        expect({ surface, drawn: tones.length > 0 }).toEqual({
          surface,
          drawn: true,
        })
        expect({ surface, tones: [...new Set(tones)] }).toEqual({
          surface,
          tones: [tone],
        })
      }
    },
  )
})

describe('unreachable wears its own glyph on Mission Control’s card (R1, MC-2)', () => {
  it('draws the glyph the sidebar’s row draws, never a dot', () => {
    const record = session({ status: 'running', attention: 'host-unreachable' })
    const { container } = render(
      <SessionCardView
        card={{
          session: record,
          projectName: 'Convergence',
          providerLabel: 'Codex',
          activityLabel: 'working',
          crews: [],
          searchText: 'walk',
        }}
        onOpen={() => {}}
      />,
      { wrapper: TooltipProvider },
    )
    // Mutation: put the warning StatusDot back in the corner -> red.
    expect(container.querySelector('[data-slot="status-dot"]')).toBeNull()
    expect(
      container.querySelector(
        `svg[data-tone="${SESSION_STATE_TONE.unreachable}"]`,
      ),
    ).not.toBeNull()
  })
})
