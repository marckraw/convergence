import { describe, expect, it } from 'vitest'
import type { ConversationItem, ForkSummary } from '@/entities/session'
import {
  computeSeedSizeWarning,
  deriveForkProgressLabel,
  estimateTranscriptTokens,
  FORK_PROGRESS_EXTENDED_THRESHOLD_MS,
  FORK_PROGRESS_SECONDARY_THRESHOLD_MS,
  FORK_PROGRESS_STALE_THRESHOLD_MS,
  renderSeedMarkdown,
} from './session-fork.pure'

const sample: ForkSummary = {
  topic: 'Refactor auth',
  decisions: [{ text: 'Use JWT', evidence: 'use JWT' }],
  open_questions: ['Refresh tokens?'],
  key_facts: [],
  artifacts: {
    urls: ['https://example.com'],
    file_paths: [],
    repos: [],
    commands: [],
    identifiers: [],
  },
  next_steps: ['Ship it'],
}

describe('renderSeedMarkdown (renderer)', () => {
  it('produces full markdown with default tail', () => {
    const md = renderSeedMarkdown({
      summary: sample,
      parentName: 'Parent',
      additionalInstruction: null,
    })
    expect(md).toContain('This session is a fork of "Parent"')
    expect(md).toContain('**Topic:** Refactor auth')
    expect(md).toContain('**Decisions made so far:**')
    expect(md).toContain('**Open questions:**')
    expect(md).toContain('**Relevant artifacts:**')
    expect(md).toContain('**Suggested next steps:**')
    expect(md).toContain('Continue from here.')
  })

  it('uses additional instruction when provided', () => {
    const md = renderSeedMarkdown({
      summary: sample,
      parentName: 'Parent',
      additionalInstruction: 'Extra',
    })
    expect(md).toContain('Extra')
    expect(md).not.toContain('Continue from here.')
  })
})

function userEntry(text: string): ConversationItem {
  return {
    id: `item-${text.length}`,
    sessionId: 'session-1',
    sequence: 1,
    turnId: null,
    kind: 'message',
    state: 'complete',
    actor: 'user',
    text,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: 'user',
    },
  }
}

describe('computeSeedSizeWarning', () => {
  it('returns null when window tokens are missing or zero', () => {
    const entries = [userEntry('hello')]
    expect(computeSeedSizeWarning(entries, null)).toBeNull()
    expect(computeSeedSizeWarning(entries, 0)).toBeNull()
    expect(computeSeedSizeWarning(entries, undefined)).toBeNull()
  })

  it('returns null when estimated usage is below 80%', () => {
    const entries = [userEntry('hello')]
    expect(computeSeedSizeWarning(entries, 100_000)).toBeNull()
  })

  it('returns percentage and token counts when estimated usage >= 80%', () => {
    const bigText = 'x'.repeat(4000)
    const entries = [userEntry(bigText)]
    const tokens = estimateTranscriptTokens(entries)
    const warning = computeSeedSizeWarning(entries, tokens + 10)
    expect(warning).not.toBeNull()
    expect(warning?.estimatedTokens).toBe(tokens)
    expect(warning?.windowTokens).toBe(tokens + 10)
    expect(warning?.percentage).toBeGreaterThanOrEqual(80)
  })
})

describe('deriveForkProgressLabel', () => {
  it('renders the elapsed-second counter in primary', () => {
    const label = deriveForkProgressLabel({
      elapsedMs: 12_400,
      msSinceLastEvent: 0,
    })
    expect(label.primary).toBe(
      'Extracting summary from parent transcript… (12s)',
    )
  })

  it('omits secondary and stale below the 30s threshold', () => {
    const label = deriveForkProgressLabel({
      elapsedMs: FORK_PROGRESS_SECONDARY_THRESHOLD_MS - 1,
      msSinceLastEvent: 999_999,
    })
    expect(label.secondary).toBeNull()
    expect(label.stale).toBe(false)
  })

  it('shows secondary hint at the 30s threshold', () => {
    const label = deriveForkProgressLabel({
      elapsedMs: FORK_PROGRESS_SECONDARY_THRESHOLD_MS,
      msSinceLastEvent: 0,
    })
    expect(label.secondary).toMatch(/Still working/)
    expect(label.stale).toBe(false)
  })

  it('marks stale only when elapsed >= 90s AND last event was >= 30s ago', () => {
    const fresh = deriveForkProgressLabel({
      elapsedMs: FORK_PROGRESS_EXTENDED_THRESHOLD_MS,
      msSinceLastEvent: FORK_PROGRESS_STALE_THRESHOLD_MS - 1,
    })
    expect(fresh.stale).toBe(false)

    const early = deriveForkProgressLabel({
      elapsedMs: FORK_PROGRESS_EXTENDED_THRESHOLD_MS - 1,
      msSinceLastEvent: FORK_PROGRESS_STALE_THRESHOLD_MS,
    })
    expect(early.stale).toBe(false)

    const stuck = deriveForkProgressLabel({
      elapsedMs: FORK_PROGRESS_EXTENDED_THRESHOLD_MS,
      msSinceLastEvent: FORK_PROGRESS_STALE_THRESHOLD_MS,
    })
    expect(stuck.stale).toBe(true)
  })
})
