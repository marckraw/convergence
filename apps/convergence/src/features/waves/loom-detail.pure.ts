import type { SessionPullRequest } from '@/shared/types/session-pull-request.types'
import type { TrackerPullRequest } from '@/shared/types/tracker.types'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { livenessAge } from '@/shared/lib/host-liveness.pure'
import { loomHorseRuntimeLabel, type LoomHorse } from './loom-horses.pure'
import {
  waveRowKey,
  type WaveRow,
  type WaveRowOpening,
} from './wave-sections.pure'

/**
 * What the tracker's word MEANS for the person reading it (MAR-3195 R2).
 *
 * `Linear: In Review` is the tracker's vocabulary; `Fable's turn` is the
 * answer to "so what do I do?". Both are shown, never merged: the tracker's
 * word is a fact about the issue and this is a fact about the loop.
 *
 * `blocked` wins over every live state, the way it does in the sheets
 * (MAR-3138 R4): whatever else is true of the issue, nothing moves until
 * somebody decides. It does NOT win over `done` -- the loop has let that go,
 * and a label left on finished work is not a question anybody can answer.
 */
export function loomStatusMeaning(
  entry: Pick<WorkLedgerEntry, 'state' | 'blocked' | 'seat'>,
): string {
  if (entry.state === 'done') return 'Done'
  if (entry.blocked) return 'Decide'
  switch (entry.state) {
    case 'reviewed':
      return 'Awaiting your QA'
    case 'returned':
      return 'Fable’s turn'
    case 'working':
      return 'In progress'
    case 'assigned':
      return entry.seat === null ? 'In preparation' : 'Queued'
    case 'stopped':
      return 'Re-groom'
    case 'unassigned':
      return 'Left the loop'
  }
}

/** What a review decision says, in words a person uses. */
const REVIEW_WORDS: Readonly<
  Record<NonNullable<SessionPullRequest['reviewDecision']>, string>
> = {
  APPROVED: 'review: approved',
  CHANGES_REQUESTED: 'review: changes requested',
  REVIEW_REQUIRED: 'review: review required',
}

/**
 * The sentence the PR block always carries (MAR-3195 R3).
 *
 * The app reads a PR by its head branch and records number, state, title and
 * a review decision -- and nothing about its checks. Saying so out loud is
 * the difference between "the app has not looked" and "CI is fine", and only
 * one of those is true.
 */
export const CI_NOT_SEEN = 'CI status not seen'

/**
 * What a tracker link can say about its state (MAR-3304 R4).
 *
 * The whole truth about a link nobody opened: the tracker says a pull
 * request is there, and that is all anybody here knows. It replaces the
 * session shape's `checked · review · CI` line rather than joining it,
 * because every word in that line is the record of a read that did not
 * happen.
 */
export const PR_STATE_NOT_READ = 'state not read — open it to see'

/** `PR #769 · linked in Linear`: the tracker linked it, nobody opened it. */
export const PR_LINKED_IN_TRACKER = 'linked in Linear'

/**
 * The linked pull request, as the detail shows it.
 *
 * Two linked shapes, TAGGED (MAR-3304 R4): the conversation's own reading
 * carries a state, a review word and a time; the tracker's link carries
 * none of those and has no field to put them in. A shared shape with
 * nullable `checked`/`review`/`ci` would leave "never claim a state nobody
 * read" as a thing every future caller must remember; this way the wrong
 * sentence has nowhere to live.
 */
export type LoomDetailPr =
  | { linked: false; line: string }
  | {
      linked: true
      source: 'session'
      /** `PR #707 · merged`. */
      headline: string
      url: string
      title: string | null
      /** `checked 5m ago`, or null when the timestamp is unreadable. */
      checked: string | null
      review: string | null
      ci: string
      /**
       * The one muted line a person actually reads (lap 2, F).
       *
       * Joined HERE and not in JSX: assembled in the component, `ci` could
       * be dropped from the array and every gate stayed green -- the
       * always-on honesty sentence R3 exists for, unpinned at any layer.
       */
      line: string
    }
  | {
      linked: true
      source: 'tracker'
      /** `PR #769 · linked in Linear` -- never a state word. */
      headline: string
      url: string
      title: string | null
      /** Always `PR_STATE_NOT_READ`; there is nothing else to say. */
      line: string
    }

function detailPr(
  pr: SessionPullRequest | TrackerPullRequest | null,
  now: number,
): LoomDetailPr {
  if (!pr) return { linked: false, line: 'No linked pull request' }
  const title = pr.title?.trim() ? pr.title.trim() : null
  if (pr.source === 'tracker') {
    return {
      linked: true,
      source: 'tracker',
      // `linked in Linear` sits exactly where `merged` sits on the session
      // shape, and says what is true of it: it is linked, not read.
      headline: `PR #${pr.number} · ${PR_LINKED_IN_TRACKER}`,
      url: pr.url,
      title,
      line: PR_STATE_NOT_READ,
    }
  }
  const age = livenessAge(pr.checkedAt, now)
  const checked = age === null ? null : `checked ${age} ago`
  const review = pr.reviewDecision ? REVIEW_WORDS[pr.reviewDecision] : null
  return {
    linked: true,
    source: 'session',
    headline: `PR #${pr.number} · ${pr.state}`,
    // The URL the read gave, never one built from the branch: a guessed
    // link that 404s is worse than no link.
    url: pr.url,
    title,
    checked,
    review,
    ci: CI_NOT_SEEN,
    line: [checked, review, CI_NOT_SEEN]
      .filter((part): part is string => part !== null)
      .join(' · '),
  }
}

/** Why a horse label is not a conversation (MAR-3195 R4). */
export const LABEL_IS_NOT_A_CONVERSATION =
  'The horse label alone does not identify a running conversation.'

/** The door to the conversation working the issue, or why there is none. */
export type LoomDetailConversation<TSession> =
  | {
      canOpen: true
      session: TSession
      /** `opus-mac · This Mac · Working`, from LV2's horse when there is one. */
      line: string
    }
  | { canOpen: false; reason: string; note: string }

function detailConversation<TSession>(
  entry: WorkLedgerEntry,
  opening: WaveRowOpening<TSession>,
  horse: LoomHorse | null,
): LoomDetailConversation<TSession> {
  if (!opening.openable) {
    return {
      canOpen: false,
      reason: opening.reason,
      note: LABEL_IS_NOT_A_CONVERSATION,
    }
  }
  const parts = horse
    ? [horse.seat ?? entry.seat, horse.hostLabel, loomHorseRuntimeLabel(horse)]
    : [entry.seat]
  return {
    canOpen: true,
    session: opening.session,
    line: parts.filter((part): part is string => !!part).join(' · '),
  }
}

/** Every word the detail shows, decided here (MAR-3195 R2). */
export interface LoomIssueDetail<TSession> {
  key: string
  identifier: string
  title: string
  url: string
  /** `Linear: In Review · Fable’s turn`. */
  statusLine: string
  summary: string
  labels: string[]
  /** `No labels`, or null when there are some to show. */
  labelsEmpty: string | null
  /** `opus-mac · This Mac · lap 3`, from the row and LV2's horse. */
  seatLine: string
  pr: LoomDetailPr
  conversation: LoomDetailConversation<TSession>
  /** `Read-only · Linear read 5m ago`. */
  footer: string
}

/**
 * The detail of one issue (MAR-3195).
 *
 * Every string a person reads is decided here, from facts the row already
 * carries -- so what the card shows can be tested without a DOM, and the
 * presentational has nothing left to decide.
 *
 * Deliberately LESS than the tracker shows (Marcin: "definitely much less
 * than in Linear"): what an issue is, what it means for him, where it is
 * being worked, and the two doors out.
 */
export function loomIssueDetail<TSession>(input: {
  row: WaveRow
  opening: WaveRowOpening<TSession>
  horse: LoomHorse | null
  /** When the tracker last answered this crew, for the freshness footer. */
  lastOkAt: string | null
  now: number
}): LoomIssueDetail<TSession> {
  const { entry } = input.row
  const labels = entry.fact.labels ?? []
  const age = livenessAge(input.lastOkAt, input.now)
  return {
    key: waveRowKey(entry),
    identifier: entry.issueIdentifier,
    title: entry.issueTitle,
    url: entry.issueUrl,
    statusLine: `Linear: ${entry.trackerStatus} · ${loomStatusMeaning(entry)}`,
    // A summary the body never gave is said as absent, never as an empty
    // line a reader would take for a missing render.
    summary: entry.fact.summary?.trim() || 'No summary yet',
    labels,
    labelsEmpty: labels.length === 0 ? 'No labels' : null,
    seatLine: [
      entry.seat ?? 'no seat',
      input.horse?.hostLabel ?? null,
      input.row.lapLabel,
    ]
      .filter((part): part is string => !!part)
      .join(' · '),
    pr: detailPr(entry.pr, input.now),
    conversation: detailConversation(entry, input.opening, input.horse),
    footer:
      age === null
        ? 'Read-only · Linear snapshot'
        : `Read-only · Linear read ${age} ago`,
  }
}
