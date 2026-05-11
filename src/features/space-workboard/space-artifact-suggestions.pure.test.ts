import { describe, expect, it } from 'vitest'
import type { SpaceArtifact } from '@/entities/space'
import { buildBranchArtifactSuggestions } from './space-artifact-suggestions.pure'

const artifact: SpaceArtifact = {
  id: 'o1',
  spaceId: 'i1',
  kind: 'branch',
  label: 'Branch feature-a',
  value: 'feature-a',
  sourceSessionId: 's1',
  status: 'in-progress',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('buildBranchArtifactSuggestions', () => {
  it('builds branch suggestions from linked Attempt facts', () => {
    const suggestions = buildBranchArtifactSuggestions({
      spaceId: 'i1',
      existingArtifacts: [],
      facts: [
        {
          sourceSessionId: 's1',
          sourceSessionName: 'Implementation',
          branchName: 'feature-a',
          upstreamBranch: 'origin/feature-a',
          remoteUrl: 'git@github.com:example/repo.git',
        },
      ],
    })

    expect(suggestions).toEqual([
      {
        id: 'branch:s1:feature-a',
        title: 'Branch feature-a',
        description:
          'Implementation tracking origin/feature-a from git@github.com:example/repo.git',
        artifact: {
          spaceId: 'i1',
          kind: 'branch',
          label: 'Branch feature-a',
          value: 'feature-a',
          sourceSessionId: 's1',
          status: 'in-progress',
        },
      },
    ])
  })

  it('skips default-looking branches', () => {
    const suggestions = buildBranchArtifactSuggestions({
      spaceId: 'i1',
      existingArtifacts: [],
      facts: [
        {
          sourceSessionId: 's1',
          sourceSessionName: 'Seed',
          branchName: 'master',
          upstreamBranch: null,
          remoteUrl: null,
        },
      ],
    })

    expect(suggestions).toEqual([])
  })

  it('dedupes against existing stable Artifacts and transient facts', () => {
    const suggestions = buildBranchArtifactSuggestions({
      spaceId: 'i1',
      existingArtifacts: [artifact],
      facts: [
        {
          sourceSessionId: 's1',
          sourceSessionName: 'Implementation',
          branchName: 'feature-a',
          upstreamBranch: null,
          remoteUrl: null,
        },
        {
          sourceSessionId: 's2',
          sourceSessionName: 'Review',
          branchName: 'feature-a',
          upstreamBranch: null,
          remoteUrl: null,
        },
        {
          sourceSessionId: 's2',
          sourceSessionName: 'Review',
          branchName: 'feature-a',
          upstreamBranch: null,
          remoteUrl: null,
        },
      ],
    })

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      'branch:s2:feature-a',
    ])
  })
})
