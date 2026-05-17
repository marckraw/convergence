import { describe, expect, it } from 'vitest'
import {
  buildCodeReviewFilePatchKey,
  buildCodeReviewSummaryKey,
  buildCodeReviewTargetId,
  countCodeReviewFilesByStatus,
  getCodeReviewEmptyMessage,
  getCodeReviewHeaderLabel,
  getCodeReviewTargetSourceLabel,
  getCodeReviewTargetSubtitle,
  getCodeReviewTargetTitle,
  selectCodeReviewFileAfterReload,
} from './code-review.pure'

const target = {
  id: 'session:session-1',
  projectId: 'project-1',
  projectName: 'Project',
  sessionId: 'session-1',
  repositoryPath: '/repo',
  workspaceId: 'workspace-1',
  sessionName: 'Implement feature',
  branchName: 'feature',
  pullRequestId: null,
  pullRequestLabel: null,
  source: 'session' as const,
  updatedAt: '2026-01-02T00:00:00.000Z',
  status: {
    workingTreeFileCount: 1,
    workingTreeStatusCounts: { M: 1 },
    error: null,
  },
}

const base = {
  branchName: 'beta',
  comparisonRef: 'origin/beta',
  source: 'project-settings' as const,
  warning: null,
}

describe('code review helpers', () => {
  it('builds stable target and cache keys', () => {
    expect(buildCodeReviewTargetId(target)).toBe('session:session-1')
    expect(buildCodeReviewSummaryKey({ target, mode: 'working-tree' })).toBe(
      'session:session-1:working-tree',
    )
    expect(
      buildCodeReviewFilePatchKey({
        target,
        mode: 'base-branch',
        filePath: 'src/app.ts',
      }),
    ).toBe('session:session-1:base-branch:src/app.ts')
  })

  it('derives target labels for the dashboard', () => {
    expect(getCodeReviewTargetTitle(target)).toBe('Implement feature')
    expect(getCodeReviewTargetSubtitle(target)).toBe(
      'Session · Project · feature',
    )
    expect(
      getCodeReviewTargetTitle({
        ...target,
        source: 'pull-request',
        pullRequestLabel: '#42 Feature · open',
      }),
    ).toBe('#42 Feature · open')
    expect(getCodeReviewTargetSourceLabel('project-repository')).toBe(
      'Project Repository',
    )
  })

  it('derives header labels for compact and full review modes', () => {
    expect(
      getCodeReviewHeaderLabel({
        mode: 'working-tree',
        count: 2,
        base: null,
      }),
    ).toBe('Changed Files (2)')
    expect(
      getCodeReviewHeaderLabel({
        mode: 'base-branch',
        count: 3,
        base,
      }),
    ).toBe('Against beta (3)')
    expect(
      getCodeReviewHeaderLabel({ mode: 'turns', count: 0, base: null }),
    ).toBe('Turns')
  })

  it('derives empty, loading, and error copy', () => {
    expect(
      getCodeReviewEmptyMessage({
        mode: 'working-tree',
        loading: false,
        base: null,
        error: null,
      }),
    ).toBe('No working tree changes detected')
    expect(
      getCodeReviewEmptyMessage({
        mode: 'base-branch',
        loading: true,
        base: null,
        error: null,
      }),
    ).toBe('Loading base branch changes...')
    expect(
      getCodeReviewEmptyMessage({
        mode: 'base-branch',
        loading: false,
        base: null,
        error: 'Base branch not found',
      }),
    ).toBe('Base branch not found')
  })

  it('keeps selected files only while they still exist', () => {
    const files = [
      { status: 'M', file: 'a.ts' },
      { status: 'A', file: 'b.ts' },
    ]

    expect(selectCodeReviewFileAfterReload({ current: 'b.ts', files })).toBe(
      'b.ts',
    )
    expect(
      selectCodeReviewFileAfterReload({ current: 'missing.ts', files }),
    ).toBe('a.ts')
    expect(selectCodeReviewFileAfterReload({ current: null, files: [] })).toBe(
      null,
    )
  })

  it('counts files by raw git status', () => {
    expect(
      countCodeReviewFilesByStatus([
        { status: 'M', file: 'a.ts' },
        { status: 'M', file: 'b.ts' },
        { status: 'A', file: 'c.ts' },
      ]),
    ).toEqual({ M: 2, A: 1 })
  })
})
