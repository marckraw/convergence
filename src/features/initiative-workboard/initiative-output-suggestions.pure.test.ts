import { describe, expect, it } from 'vitest'
import type { InitiativeOutput } from '@/entities/initiative'
import { buildBranchOutputSuggestions } from './initiative-output-suggestions.pure'

const output: InitiativeOutput = {
  id: 'o1',
  initiativeId: 'i1',
  kind: 'branch',
  label: 'Branch feature-a',
  value: 'feature-a',
  sourceSessionId: 's1',
  status: 'in-progress',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('buildBranchOutputSuggestions', () => {
  it('builds branch suggestions from linked Attempt facts', () => {
    const suggestions = buildBranchOutputSuggestions({
      initiativeId: 'i1',
      existingOutputs: [],
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
        output: {
          initiativeId: 'i1',
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
    const suggestions = buildBranchOutputSuggestions({
      initiativeId: 'i1',
      existingOutputs: [],
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

  it('dedupes against existing stable Outputs and transient facts', () => {
    const suggestions = buildBranchOutputSuggestions({
      initiativeId: 'i1',
      existingOutputs: [output],
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
