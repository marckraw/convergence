import { describe, expect, it } from 'vitest'
import {
  buildCodeReviewGuideKey,
  buildDeterministicCodeReviewGuide,
  getCodeReviewGuideFileCount,
  getCodeReviewGuideRiskRationale,
} from './code-review-guide.pure'

describe('code review guide helpers', () => {
  it('groups changed files into deterministic review sections', () => {
    const guide = buildDeterministicCodeReviewGuide([
      {
        status: 'M',
        file: 'electron/backend/code-review/code-review.service.ts',
      },
      { status: 'M', file: 'src/entities/code-review/code-review.model.ts' },
      { status: 'A', file: 'src/widgets/code-review-surface/guide.tsx' },
      { status: 'M', file: 'src/widgets/code-review-surface/guide.test.tsx' },
      { status: 'A', file: 'docs/specs/code-review-guide-mode.md' },
    ])

    expect(guide.generatedBy).toBe('deterministic')
    expect(guide.sections.map((section) => section.id)).toEqual([
      'backend-runtime',
      'renderer-state',
      'tests',
      'review-surface',
      'docs-and-config',
    ])
    expect(getCodeReviewGuideFileCount(guide)).toBe(5)
  })

  it('keeps unclassified files visible in an other changes section', () => {
    const guide = buildDeterministicCodeReviewGuide([
      { status: 'M', file: 'scripts/release-note.txt' },
    ])

    expect(guide.sections).toHaveLength(1)
    expect(guide.sections[0]).toMatchObject({
      id: 'other-changes',
      riskLevel: 'medium',
      files: [
        {
          path: 'scripts/release-note.txt',
          status: 'M',
        },
      ],
    })
  })

  it('returns an empty guide for empty file lists', () => {
    const guide = buildDeterministicCodeReviewGuide([])

    expect(guide.sections).toEqual([])
    expect(guide.overview).toBe(
      'No changed files are available for a deterministic guide.',
    )
  })

  it('returns risk rationale for guide sections with legacy fallbacks', () => {
    const guide = buildDeterministicCodeReviewGuide([
      { status: 'M', file: 'src/entities/code-review/code-review.model.ts' },
    ])

    expect(getCodeReviewGuideRiskRationale(guide.sections[0])).toBe(
      'Changes shared renderer contracts and state helpers that multiple UI surfaces may depend on.',
    )
    expect(
      getCodeReviewGuideRiskRationale({
        ...guide.sections[0],
        riskRationale: '',
      }),
    ).toBe(
      'Marked medium risk because this section may affect shared behavior or user-facing flow.',
    )
  })

  it('builds a cache key from target, mode, and cache identity', () => {
    expect(
      buildCodeReviewGuideKey({
        target: {
          id: 'session:session-1',
          projectId: 'project-1',
          projectName: 'Project',
          repositoryPath: '/repo',
          workspaceId: null,
          sessionId: 'session-1',
          sessionName: 'Session',
          branchName: 'feature',
          pullRequestId: null,
          pullRequestNumber: null,
          pullRequestLabel: null,
          pullRequestUrl: null,
          pullRequestBaseBranch: null,
          pullRequestHeadBranch: null,
          source: 'session',
          updatedAt: null,
          status: {
            workingTreeFileCount: 1,
            workingTreeStatusCounts: { M: 1 },
            error: null,
          },
        },
        mode: 'base-branch',
        cacheIdentity: {
          comparisonRef: 'origin/main',
          comparisonPoint: 'merge-base-1',
          workingTreeVersionToken: 'wt-1',
        },
      }),
    ).toBe('session:session-1::base-branch::origin/main::merge-base-1::wt-1')
  })
})
