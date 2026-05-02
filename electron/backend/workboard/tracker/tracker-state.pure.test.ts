import { describe, expect, it } from 'vitest'
import {
  deriveIssueStateFromLabels,
  hasWorkboardVisibilityLabel,
  normalizeIssuePriority,
} from './tracker-state.pure'

describe('tracker-state.pure', () => {
  it('detects Workboard visibility labels case-insensitively', () => {
    expect(hasWorkboardVisibilityLabel(['bug', 'Convergence-Loop'])).toBe(true)
    expect(hasWorkboardVisibilityLabel(['loop-ready'])).toBe(false)
  })

  it('derives the active loop state from labels', () => {
    expect(deriveIssueStateFromLabels(['convergence-loop'])).toBe('candidate')
    expect(deriveIssueStateFromLabels(['loop-ready'])).toBe('ready')
    expect(deriveIssueStateFromLabels(['loop-blocked'])).toBe('blocked')
    expect(deriveIssueStateFromLabels(['loop-review'])).toBe('review')
  })

  it('normalizes issue priority to the Workboard vocabulary', () => {
    expect(normalizeIssuePriority('Urgent')).toBe('urgent')
    expect(normalizeIssuePriority('HIGH')).toBe('high')
    expect(normalizeIssuePriority('not-a-priority')).toBe('low')
    expect(normalizeIssuePriority(null)).toBe('low')
  })
})
