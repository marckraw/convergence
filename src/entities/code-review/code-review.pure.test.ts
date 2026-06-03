import { describe, expect, it } from 'vitest'
import {
  buildCodeReviewFilePatchKey,
  buildCodeReviewFilePatchSelectionKey,
  buildCodeReviewSummaryKey,
  buildCodeReviewSummarySelectionKey,
  buildCodeReviewTargetId,
  countCodeReviewTargetsByFilterSource,
  countCodeReviewFilesByStatus,
  filterCodeReviewTargetsByQuery,
  filterCodeReviewTargetsBySource,
  getCodeReviewEmptyMessage,
  getCodeReviewHeaderLabel,
  getCodeReviewTargetFilterSource,
  getCodeReviewTargetSourceLabel,
  getCodeReviewTargetSubtitle,
  getCodeReviewTargetTitle,
  isRemotePullRequestTarget,
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
  pullRequestNumber: null,
  pullRequestLabel: null,
  pullRequestUrl: null,
  pullRequestBaseBranch: null,
  pullRequestHeadBranch: null,
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

const cacheIdentity = {
  comparisonRef: 'origin/beta',
  comparisonPoint: 'merge-base-1',
  workingTreeVersionToken: 'wt-1',
}

describe('code review helpers', () => {
  it('builds stable target and cache keys', () => {
    expect(buildCodeReviewTargetId(target)).toBe('session:session-1')
    expect(
      buildCodeReviewSummarySelectionKey({ target, mode: 'working-tree' }),
    ).toBe('session:session-1:working-tree')
    expect(
      buildCodeReviewSummaryKey({
        target,
        mode: 'working-tree',
        cacheIdentity,
      }),
    ).toBe('session:session-1:working-tree:origin/beta:merge-base-1:wt-1')
    expect(
      buildCodeReviewFilePatchSelectionKey({
        target,
        mode: 'base-branch',
        filePath: 'src/app.ts',
      }),
    ).toBe('session:session-1:base-branch:src/app.ts')
    expect(
      buildCodeReviewFilePatchKey({
        target,
        mode: 'base-branch',
        filePath: 'src/app.ts',
        cacheIdentity,
      }),
    ).toBe(
      'session:session-1:base-branch:origin/beta:merge-base-1:wt-1:src/app.ts',
    )
    expect(
      buildCodeReviewSummaryKey({
        target,
        mode: 'working-tree',
        cacheIdentity: {
          comparisonRef: null,
          comparisonPoint: null,
          workingTreeVersionToken: 'wt-2',
        },
      }),
    ).toBe('session:session-1:working-tree:none:none:wt-2')
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
        workspaceId: null,
        pullRequestNumber: 42,
        pullRequestLabel: '#42 Feature · open',
        pullRequestUrl: 'https://github.com/acme/app/pull/42',
        pullRequestBaseBranch: 'main',
        pullRequestHeadBranch: 'feature',
      }),
    ).toBe('#42 Feature · open')
    expect(
      isRemotePullRequestTarget({
        ...target,
        source: 'pull-request',
        workspaceId: null,
        pullRequestNumber: 42,
      }),
    ).toBe(true)
    expect(
      isRemotePullRequestTarget({
        ...target,
        source: 'pull-request',
        workspaceId: 'workspace-1',
        pullRequestNumber: 42,
      }),
    ).toBe(false)
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
    expect(
      getCodeReviewHeaderLabel({
        mode: 'working-tree',
        count: 4,
        base,
        target: {
          ...target,
          source: 'pull-request',
          workspaceId: null,
          pullRequestNumber: 42,
        },
      }),
    ).toBe('Pull Request (4)')
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
    expect(
      getCodeReviewEmptyMessage({
        mode: 'working-tree',
        loading: false,
        base,
        error: null,
        target: {
          ...target,
          source: 'pull-request',
          workspaceId: null,
          pullRequestNumber: 42,
        },
      }),
    ).toBe('No pull request changes detected')
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

  it('filters targets by user-facing source buckets', () => {
    const sessionTarget = target
    const workspaceTarget = {
      ...target,
      id: 'workspace:workspace-1',
      source: 'workspace' as const,
      sessionId: null,
      sessionName: null,
    }
    const projectRepositoryTarget = {
      ...target,
      id: 'project-repository:project-1',
      source: 'project-repository' as const,
      workspaceId: null,
      sessionId: null,
      sessionName: null,
      branchName: null,
    }
    const pullRequestTarget = {
      ...target,
      id: 'pull-request:pr-1',
      source: 'pull-request' as const,
      pullRequestNumber: 42,
      pullRequestLabel: '#42 Feature · open',
    }

    const targets = [
      sessionTarget,
      workspaceTarget,
      projectRepositoryTarget,
      pullRequestTarget,
    ]

    expect(getCodeReviewTargetFilterSource(projectRepositoryTarget)).toBe(
      'workspace',
    )
    expect(countCodeReviewTargetsByFilterSource(targets)).toEqual({
      session: 1,
      workspace: 2,
      'pull-request': 1,
    })
    expect(
      filterCodeReviewTargetsBySource({
        targets,
        sources: ['workspace', 'pull-request'],
      }).map((item) => item.id),
    ).toEqual([
      'workspace:workspace-1',
      'project-repository:project-1',
      'pull-request:pr-1',
    ])
    expect(
      filterCodeReviewTargetsBySource({
        targets,
        sources: ['pull-request'],
      }).map((item) => item.id),
    ).toEqual(['pull-request:pr-1'])
    expect(
      filterCodeReviewTargetsByQuery({
        targets,
        query: 'feature',
      }).map((item) => item.id),
    ).toEqual([
      'session:session-1',
      'workspace:workspace-1',
      'pull-request:pr-1',
    ])
    expect(
      filterCodeReviewTargetsByQuery({
        targets,
        query: '#42',
      }).map((item) => item.id),
    ).toEqual(['pull-request:pr-1'])
  })
})
