import { describe, expect, it } from 'vitest'
import {
  buildCodeReviewGuideCacheKey,
  normalizeCodeReviewGuideDraft,
} from './code-review-guide.pure'
import type { CodeReviewGuideDraft } from './code-review-guide.types'

describe('code review guide pure helpers', () => {
  it('builds stable cache keys from the full cache identity', () => {
    expect(
      buildCodeReviewGuideCacheKey({
        comparisonRef: null,
        comparisonPoint: null,
        workingTreeVersionToken: 'wt-1',
      }),
    ).toBe(
      '{"comparisonRef":null,"comparisonPoint":null,"workingTreeVersionToken":"wt-1"}',
    )
  })

  it('drops unknown files and appends unassigned changed files', () => {
    const draft: CodeReviewGuideDraft = {
      overview: 'Generated',
      generatedBy: 'agent',
      sections: [
        {
          id: 'primary',
          title: 'Primary',
          summary: 'Summary',
          narrative: 'Narrative',
          riskLevel: 'high',
          riskRationale: 'Touches critical behavior.',
          checklist: [],
          files: [
            {
              path: 'src/app.ts',
              status: 'M',
              reason: 'Known',
              hunkHints: [],
            },
            {
              path: 'src/missing.ts',
              status: 'M',
              reason: 'Unknown',
              hunkHints: [],
            },
          ],
        },
      ],
    }

    const normalized = normalizeCodeReviewGuideDraft({
      draft,
      files: [
        { file: 'src/app.ts', status: 'M' },
        { file: 'src/other.ts', status: 'A' },
      ],
    })

    expect(normalized.sections).toHaveLength(2)
    expect(normalized.sections[0].files.map((file) => file.path)).toEqual([
      'src/app.ts',
    ])
    expect(normalized.sections[1]).toMatchObject({
      id: 'other-changes',
      files: [{ path: 'src/other.ts', status: 'A' }],
    })
  })
})
