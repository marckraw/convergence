import { describe, expect, it } from 'vitest'
import type { WorkLedgerState } from '@/entities/work-ledger'
import {
  CI_NOT_SEEN,
  LABEL_IS_NOT_A_CONVERSATION,
  loomIssueDetail,
  loomStatusMeaning,
} from './loom-detail.pure'
import { loomHorses } from './loom-horses.pure'
import { loomSheets } from './loom-sheets.pure'
import { boundCrewWith, ledgerEntry, residentSeat } from './wave-rows.fixture'
import {
  waveLapLabel,
  waveRowAction,
  waveRowHostMarker,
} from './wave-sections.pure'

const NOW = Date.parse('2026-09-19T08:00:00.000Z')
const OK_AT = '2026-09-19T07:55:00.000Z'

const rowOf = (overrides: Parameters<typeof ledgerEntry>[0]) => {
  const entry = ledgerEntry(overrides)
  return {
    entry,
    action: waveRowAction(entry),
    hostMarker: waveRowHostMarker(entry, NOW),
    crewName: null,
    lapLabel: waveLapLabel(entry.lap, null),
  }
}

const detailOf = (
  overrides: Parameters<typeof ledgerEntry>[0],
  opening: Parameters<typeof loomIssueDetail>[0]['opening'] = {
    openable: false,
    reason: 'conversation not loaded',
  },
) =>
  loomIssueDetail({
    row: rowOf(overrides),
    opening,
    horse: null,
    lastOkAt: OK_AT,
    now: NOW,
  })

describe('MAR-3195 R2: what the tracker’s word means for the person', () => {
  it.each([
    ['reviewed', false, 'opus', 'Awaiting your QA'],
    ['returned', false, 'opus', 'Fable’s turn'],
    ['working', false, 'opus', 'In progress'],
    ['assigned', false, 'opus', 'Queued'],
    ['assigned', false, null, 'In preparation'],
    ['done', false, 'opus', 'Done'],
    ['stopped', false, 'opus', 'Re-groom'],
    ['unassigned', false, null, 'Left the loop'],
  ] as [WorkLedgerState, boolean, string | null, string][])(
    '%s (blocked %s, seat %s) -> %s',
    (state, blocked, seat, expected) => {
      expect(loomStatusMeaning({ state, blocked, seat })).toBe(expected)
    },
  )

  it.each([
    ['working', 'Decide'],
    ['reviewed', 'Decide'],
    ['returned', 'Decide'],
    ['assigned', 'Decide'],
    ['stopped', 'Decide'],
    // ...but not over `done`: the loop has let that go, and a label left on
    // finished work is not a question anybody can answer (MAR-3138 lap 2, A).
    ['done', 'Done'],
  ] as [WorkLedgerState, string][])('blocked %s -> %s', (state, expected) => {
    // Mutation: ask `blocked` after the state -> every live row reads its
    // own state's word while nothing can move, red five times.
    expect(loomStatusMeaning({ state, blocked: true, seat: 'opus' })).toBe(
      expected,
    )
  })

  it('the status line carries BOTH words, never one', () => {
    // The tracker's vocabulary and the loop's answer are two facts. Mutation:
    // show only the meaning -> the person cannot match the card to Linear.
    expect(
      detailOf({
        issueIdentifier: 'MAR-1',
        state: 'returned',
        trackerStatus: 'In Review',
      }).statusLine,
    ).toBe('Linear: In Review · Fable’s turn')
  })

  it('an absent summary and no labels are said out loud', () => {
    const empty = detailOf({ issueIdentifier: 'MAR-1' })
    // Mutation: render '' -> a reader takes a blank line for a broken card.
    expect(empty.summary).toBe('No summary yet')
    expect(empty.labelsEmpty).toBe('No labels')
    const full = detailOf({
      issueIdentifier: 'MAR-1',
      fact: {
        logicalStatus: 'in-progress',
        branchName: null,
        updatedAt: null,
        summary: '  The promise.  ',
        labels: ['groomed', 'horse › opus-mac'],
      },
    })
    expect(full.summary).toBe('The promise.')
    expect(full.labels).toEqual(['groomed', 'horse › opus-mac'])
    expect(full.labelsEmpty).toBeNull()
  })
})

describe('MAR-3195 R3: the PR block says what the app read', () => {
  const pr = {
    number: 707,
    url: 'https://github.com/example/repo/pull/707',
    state: 'merged' as const,
    headBranch: 'agent/mar-3183',
    checkedAt: '2026-09-19T07:55:00.000Z',
    source: 'gh' as const,
    title: 'feat(accounts): connectors for Codex accounts',
    reviewDecision: 'APPROVED' as const,
  }

  it('a merged PR with a title, a review and the CI sentence', () => {
    const block = detailOf({ issueIdentifier: 'MAR-1', pr }).pr
    expect(block.linked).toBe(true)
    if (!block.linked) return
    expect(block.headline).toBe('PR #707 · merged')
    expect(block.title).toBe('feat(accounts): connectors for Codex accounts')
    expect(block.checked).toBe('checked 5m ago')
    expect(block.review).toBe('review: approved')
    // The app reads a PR by its branch and never its checks. Mutation: infer
    // "checks passed" from `state === 'merged'` -> the card claims something
    // nobody looked at, red.
    expect(block.ci).toBe(CI_NOT_SEEN)
    // The line a person reads, joined here so it can be pinned (lap 2, F).
    // Mutation: drop `ci` from the join -> red.
    expect(block.line).toBe(
      'checked 5m ago · review: approved · CI status not seen',
    )
    // The URL the read gave, never one built from the branch.
    // Mutation: build it from `headBranch` -> red.
    expect(block.url).toBe(pr.url)
  })

  it('a draft with no title and no review still says the CI sentence', () => {
    const block = detailOf({
      issueIdentifier: 'MAR-1',
      pr: {
        ...pr,
        state: 'draft',
        title: undefined,
        reviewDecision: undefined,
      },
    }).pr
    expect(block.linked).toBe(true)
    if (!block.linked) return
    expect(block.headline).toBe('PR #707 · draft')
    expect(block.title).toBeNull()
    expect(block.review).toBeNull()
    expect(block.ci).toBe(CI_NOT_SEEN)
    expect(block.line).toBe('checked 5m ago · CI status not seen')
  })

  it('no PR is its own sentence', () => {
    const block = detailOf({ issueIdentifier: 'MAR-1' }).pr
    expect(block.linked).toBe(false)
    if (block.linked) return
    expect(block.line).toBe('No linked pull request')
  })
})

describe('MAR-3195 R4: the conversation door, and why there is none', () => {
  it('openable carries the session and the seat’s line from LV2’s horse', () => {
    const sheets = loomSheets(
      [
        ledgerEntry({
          issueIdentifier: 'MAR-1',
          state: 'working',
          seat: 'opus-mac',
          sessionId: 'session-opus-mac',
        }),
      ],
      NOW,
    )
    const horse = loomHorses({
      crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
      sessionsById: new Map([['session-opus-mac', { status: 'running' }]]),
      sheets,
      hostLabelOf: () => 'This Mac',
    })[0]!
    const detail = loomIssueDetail({
      row: sheets.now.inFlight[0]!,
      opening: { openable: true, session: { id: 'session-opus-mac' } },
      horse,
      lastOkAt: OK_AT,
      now: NOW,
    })
    expect(detail.conversation.canOpen).toBe(true)
    if (!detail.conversation.canOpen) return
    expect(detail.conversation.session).toEqual({ id: 'session-opus-mac' })
    // Mutation: build the line from the row's seat alone -> the host and the
    // runtime word vanish, and the door says less than the card above it.
    expect(detail.conversation.line).toBe('opus-mac · This Mac · Working')
  })

  it('a refusal is the reason plus the sentence about labels', () => {
    const detail = detailOf(
      { issueIdentifier: 'MAR-1', sessionId: null },
      { openable: false, reason: 'no conversation for this seat' },
    )
    expect(detail.conversation.canOpen).toBe(false)
    if (detail.conversation.canOpen) return
    expect(detail.conversation.reason).toBe('no conversation for this seat')
    // Mutation: drop the note -> a person reads "no conversation" and
    // wonders why the horse label on the row is not one.
    expect(detail.conversation.note).toBe(LABEL_IS_NOT_A_CONVERSATION)
  })
})

describe('MAR-3195: the footer says what this card is, and how fresh', () => {
  it('an age when the tracker answered, a snapshot when it has not', () => {
    expect(detailOf({ issueIdentifier: 'MAR-1' }).footer).toBe(
      'Read-only · Linear read 5m ago',
    )
    expect(
      loomIssueDetail({
        row: rowOf({ issueIdentifier: 'MAR-1' }),
        opening: { openable: false, reason: 'conversation not loaded' },
        horse: null,
        lastOkAt: null,
        now: NOW,
      }).footer,
      // Mutation: print `Read-only · Linear read null ago` -> red; an age the
      // app does not have is a word it must not say.
    ).toBe('Read-only · Linear snapshot')
  })

  it('the key is the row’s own, so the card can be re-found (R1)', () => {
    expect(detailOf({ issueIdentifier: 'MAR-1' }).key).toBe('crew-1:MAR-1')
  })
})
