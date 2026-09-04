import { describe, expect, it } from 'vitest'
import type {
  ConversationSnapshot,
  DaemonStatusView,
} from '../../shared/studio-api'
import {
  composerState,
  conversationTimestamp,
  daemonHeadline,
  snapshotForSelection,
  statusBadge,
  transcriptWarnings,
} from './conversation.pure'

const snapshot = (
  over: Partial<ConversationSnapshot> = {},
): ConversationSnapshot => ({
  id: 'c-1',
  title: 'a page',
  createdAt: '2026-09-02T09:00:00.000Z',
  updatedAt: '2026-09-02T09:00:00.000Z',
  status: 'idle',
  items: [],
  streamError: null,
  unreadableTailLines: 0,
  orphanPatches: 0,
  ...over,
})

const daemon = (over: Partial<DaemonStatusView> = {}): DaemonStatusView => ({
  status: 'connected',
  headline: 'Connected to the daemon.',
  detail: null,
  advertisedProviders: ['claude', 'codex'],
  providerMissing: false,
  ...over,
})

describe('statusBadge', () => {
  /**
   * Failure never borrows another state's word or colour.
   *
   * Mutation: return the idle badge for `failed` and this goes red on both the
   * label and the tone.
   */
  it('gives every state a word and a colour of its own', () => {
    const badges = (['running', 'idle', 'failed'] as const).map(statusBadge)
    expect(badges.map((badge) => badge.label)).toEqual([
      'Working',
      'Ready for you',
      'Failed',
    ])
    expect(new Set(badges.map((badge) => badge.tone)).size).toBe(3)
  })
})

describe('conversationTimestamp', () => {
  it('shows the clock for today and the date for anything older', () => {
    const now = new Date('2026-09-02T18:00:00.000Z')
    expect(conversationTimestamp('2026-09-02T09:00:00.000Z', now)).toMatch(/\d/)
    expect(conversationTimestamp('2026-08-02T09:00:00.000Z', now)).not.toBe(
      conversationTimestamp('2026-09-02T09:00:00.000Z', now),
    )
  })

  it('says nothing rather than NaN for an unreadable time', () => {
    expect(conversationTimestamp('not a date')).toBe('')
  })
})

describe('transcriptWarnings', () => {
  it('says nothing about a healthy conversation', () => {
    expect(transcriptWarnings(snapshot())).toEqual([])
  })

  /**
   * The three ways a transcript can be incomplete, each reported in its own
   * words so a reader can tell which happened.
   *
   * Mutation: drop the `unreadableTailLines` arm and a torn log becomes an
   * invisible hole -> red.
   */
  it('reports every way the transcript could be incomplete', () => {
    const warnings = transcriptWarnings(
      snapshot({
        streamError: 'the stream dropped',
        unreadableTailLines: 2,
        orphanPatches: 1,
      }),
    )
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toBe('the stream dropped')
    expect(warnings[1]).toContain('2 recorded events')
    expect(warnings[2]).toContain('1 update')
  })
})

describe('daemonHeadline', () => {
  it('repeats the handshake when there is nothing else to say', () => {
    expect(daemonHeadline(daemon(), 'claude')).toBe('Connected to the daemon.')
  })

  /**
   * A daemon that is connected but has no such provider is about to refuse
   * every start, and the names it does offer are the half that fixes it.
   *
   * Mutation: return `daemon.headline` unconditionally and this goes red.
   */
  it('does not call a daemon fine when it lacks the configured provider', () => {
    const said = daemonHeadline(
      daemon({ providerMissing: true }),
      'claude-code',
    )
    expect(said).toContain('claude-code')
    expect(said).toContain('claude, codex')
    expect(said).not.toBe('Connected to the daemon.')
  })

  it('still reads when the daemon advertises nothing', () => {
    expect(
      daemonHeadline(
        daemon({ providerMissing: true, advertisedProviders: [] }),
        'claude',
      ),
    ).toContain('none')
  })
})

describe('composerState', () => {
  it('invites a first sentence when nothing is selected', () => {
    const state = composerState(null)
    expect(state.canSend).toBe(true)
    expect(state.placeholder).toContain('make')
  })

  /**
   * Studio does not queue input yet, so a person typing into a working
   * conversation is told to wait rather than shown a message that vanishes.
   *
   * Mutation: return `canSend: true` for a running conversation and this goes
   * red — and the composer would post a command whose result no surface shows.
   */
  it('refuses to send into a working conversation, and says why', () => {
    const state = composerState(snapshot({ status: 'running' }))
    expect(state.canSend).toBe(false)
    expect(state.hint).toContain('does not queue')
  })

  it('lets a failed conversation be talked to again', () => {
    expect(composerState(snapshot({ status: 'failed' })).canSend).toBe(true)
  })
})

/**
 * L1: the window holds one snapshot and one selection, updated by different
 * beats. Between a click and the fetch that answers it, the held snapshot is
 * the PREVIOUS conversation's — and everything read off it was therefore about
 * the wrong conversation, the composer included.
 */
describe('snapshotForSelection', () => {
  /**
   * Mutation: `return snapshot` (ignore the id) and the previous
   * conversation's snapshot is handed to the transcript AND to the composer,
   * which addresses its follow-up to whichever conversation answered last ->
   * red.
   */
  it("refuses a snapshot that is not the selection's", () => {
    expect(snapshotForSelection('c-2', snapshot({ id: 'c-1' }))).toBeNull()
  })

  it("passes the selection's own snapshot through", () => {
    const held = snapshot({ id: 'c-2' })
    expect(snapshotForSelection('c-2', held)).toBe(held)
  })

  /**
   * A new conversation has no selection and no snapshot, and must not be
   * handed a leftover one: `send` reads the SELECTION to decide between
   * starting and continuing, and the composer's own state reads this.
   *
   * Mutation: `selectedId === null ? snapshot : …` -> red.
   */
  it('has nothing to offer when nothing is selected', () => {
    expect(snapshotForSelection(null, snapshot({ id: 'c-1' }))).toBeNull()
    expect(snapshotForSelection('c-1', null)).toBeNull()
  })

  /**
   * The reading that made this worth extracting: a composer given the previous
   * conversation's snapshot invites a message into a session that is working.
   *
   * Mutation: the same `return snapshot` above and this reads `canSend: false`
   * about a conversation nobody selected -> red.
   */
  it('leaves the composer describing the selection, not the leftover', () => {
    const stale = snapshot({ id: 'c-1', status: 'running' })
    expect(composerState(snapshotForSelection('c-2', stale)).canSend).toBe(true)
  })
})
