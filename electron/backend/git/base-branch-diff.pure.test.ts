import { describe, expect, it } from 'vitest'
import {
  mergeChangedFileLists,
  normalizeBranchName,
  parseNameStatusOutput,
  selectBaseBranchCandidate,
} from './base-branch-diff.pure'

describe('base branch diff pure helpers', () => {
  it('normalizes branch refs for display', () => {
    expect(normalizeBranchName('origin/beta')).toBe('beta')
    expect(normalizeBranchName('refs/heads/main')).toBe('main')
    expect(normalizeBranchName(' feature ')).toBe('feature')
  })

  it('selects base branch by configured priority', () => {
    expect(
      selectBaseBranchCandidate({
        pullRequestBaseBranch: 'beta',
        projectBaseBranch: 'main',
        remoteDefaultBranch: 'master',
        conventionalBranch: 'main',
        currentBranch: 'feature',
      }),
    ).toEqual({ branchName: 'beta', source: 'pull-request' })

    expect(
      selectBaseBranchCandidate({
        pullRequestBaseBranch: null,
        projectBaseBranch: 'main',
        remoteDefaultBranch: 'master',
        conventionalBranch: 'main',
        currentBranch: 'feature',
      }),
    ).toEqual({ branchName: 'main', source: 'project-settings' })
  })

  it('falls back to current branch when no base candidate exists', () => {
    expect(
      selectBaseBranchCandidate({
        pullRequestBaseBranch: null,
        projectBaseBranch: null,
        remoteDefaultBranch: null,
        conventionalBranch: null,
        currentBranch: 'feature',
      }),
    ).toEqual({ branchName: 'feature', source: 'current-branch' })
  })

  it('parses name-status output including renames', () => {
    const output = [
      'M\tsrc/app.ts',
      'A\tsrc/new.ts',
      'D\tsrc/old.ts',
      'R100\tsrc/before.ts\tsrc/after.ts',
    ].join('\n')

    expect(parseNameStatusOutput(output)).toEqual([
      { status: 'M', file: 'src/app.ts' },
      { status: 'A', file: 'src/new.ts' },
      { status: 'D', file: 'src/old.ts' },
      { status: 'R', file: 'src/after.ts' },
    ])
  })

  it('merges tracked and untracked files without duplicates', () => {
    expect(
      mergeChangedFileLists(
        [
          { status: 'M', file: 'src/app.ts' },
          { status: 'A', file: 'src/new.ts' },
        ],
        ['src/new.ts', 'README.md'],
      ),
    ).toEqual([
      { status: '??', file: 'README.md' },
      { status: 'M', file: 'src/app.ts' },
      { status: 'A', file: 'src/new.ts' },
    ])
  })
})
