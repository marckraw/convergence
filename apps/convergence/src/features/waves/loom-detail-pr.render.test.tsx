import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { LoomDetailView } from './loom-detail.presentational'
import { loomIssueDetail } from './loom-detail.pure'
import { ledgerEntry } from './wave-rows.fixture'
import {
  waveLapLabel,
  waveRowAction,
  waveRowHostMarker,
} from './wave-sections.pure'
import type { WorkLedgerEntry } from '@/entities/work-ledger'

/**
 * The PR block on screen (MAR-3304 R4; the MAR-2280 law): what a person reads
 * is asserted on the RENDERED card, not on the object that fed it. The two
 * linked shapes say different things, and the difference is the whole point.
 */

const NOW = Date.parse('2026-09-19T08:00:00.000Z')

const SESSION_PR = {
  number: 707,
  url: 'https://github.com/example/repo/pull/707',
  state: 'open' as const,
  headBranch: 'agent/mar-1',
  checkedAt: '2026-09-19T07:55:00.000Z',
  source: 'gh' as const,
  title: 'feat(loom): the strip',
  reviewDecision: 'APPROVED' as const,
}

const TRACKER_PR = {
  source: 'tracker' as const,
  number: 769,
  url: 'https://github.com/marckraw/convergence/pull/769',
  title: 'fix(loom): pending transcript patches land before teardown',
}

function block(pr: WorkLedgerEntry['pr']): HTMLElement {
  const entry = ledgerEntry({ issueIdentifier: 'MAR-3274', pr })
  render(
    <LoomDetailView
      detail={loomIssueDetail({
        row: {
          entry,
          action: waveRowAction(entry),
          hostMarker: waveRowHostMarker(entry, NOW),
          crewName: null,
          lapLabel: waveLapLabel(entry.lap, null),
        },
        opening: { openable: false, reason: 'conversation not loaded' },
        horse: null,
        lastOkAt: '2026-09-19T07:55:00.000Z',
        now: NOW,
      })}
      onClose={vi.fn()}
      onOpenConversation={vi.fn()}
    />,
  )
  return screen.getByLabelText('Linked pull request')
}

afterEach(cleanup)

describe('MAR-3304 R4: the rendered PR block says only what was read', () => {
  it('a tracker link: the number, the words, the title, and a live href', () => {
    const section = block(TRACKER_PR)
    const link = within(section).getByRole('link')
    expect(link.textContent).toContain('PR #769 · linked in Linear')
    expect(link.getAttribute('href')).toBe(TRACKER_PR.url)
    expect(within(section).getByText(TRACKER_PR.title)).toBeTruthy()
    expect(
      within(section).getByText('state not read — open it to see'),
    ).toBeTruthy()
    // Mutation: render the tracker link with `· open` as its state -> red.
    expect(section.textContent).not.toContain('· open')
    expect(section.textContent).not.toContain('checked')
    expect(section.textContent).not.toContain('review')
    expect(section.textContent).not.toContain('CI status not seen')
  })

  it('the conversation’s reading renders exactly as it did before', () => {
    const section = block(SESSION_PR)
    const link = within(section).getByRole('link')
    expect(link.textContent).toContain('PR #707 · open')
    expect(link.getAttribute('href')).toBe(SESSION_PR.url)
    expect(within(section).getByText(SESSION_PR.title)).toBeTruthy()
    expect(
      within(section).getByText(
        'checked 5m ago · review: approved · CI status not seen',
      ),
    ).toBeTruthy()
    expect(section.textContent).not.toContain('linked in Linear')
  })

  it('no pull request anywhere: the sentence, and no link at all', () => {
    const section = block(null)
    expect(within(section).getByText('No linked pull request')).toBeTruthy()
    expect(within(section).queryByRole('link')).toBeNull()
  })
})
