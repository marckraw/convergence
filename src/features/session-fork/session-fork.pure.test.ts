import { describe, expect, it } from 'vitest'
import type { ForkSummary, TranscriptEntry } from '@/entities/session'
import {
  computeSeedSizeWarning,
  estimateTranscriptTokens,
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

function userEntry(text: string): TranscriptEntry {
  return { type: 'user', text, timestamp: '2026-01-01T00:00:00.000Z' }
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
