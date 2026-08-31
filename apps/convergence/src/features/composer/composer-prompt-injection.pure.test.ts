import { describe, expect, it } from 'vitest'
import type {
  PromptLibraryCatalog,
  PromptLibraryEntry,
} from '@/entities/prompt-library'
import { filterComposerPrompts } from './composer-prompt-injection.pure'

function prompt(
  id: string,
  overrides: Partial<PromptLibraryEntry> = {},
): PromptLibraryEntry {
  return {
    id,
    title: id,
    description: `${id} description`,
    shortDescription: null,
    path: `/tmp/${id}.md`,
    relativePath: `${id}.md`,
    scope: 'project',
    sourceLabel: 'Project',
    kind: 'markdown',
    tags: [],
    sizeBytes: 10,
    ...overrides,
  }
}

const catalog: PromptLibraryCatalog = {
  projectId: 'project-1',
  projectName: 'convergence',
  refreshedAt: '2026-06-02T00:00:00.000Z',
  roots: [],
  prompts: [
    prompt('daily-plan', {
      title: 'Daily Plan',
      scope: 'global',
      sourceLabel: 'Global',
      tags: ['planning'],
    }),
    prompt('review-pr', {
      title: 'Review PR',
      description: 'Review pull requests.',
      tags: ['review', 'github'],
    }),
  ],
}

describe('filterComposerPrompts', () => {
  it('matches prompt metadata', () => {
    expect(
      filterComposerPrompts({
        catalog,
        query: 'pull requests',
      }).map((entry) => entry.id),
    ).toEqual(['review-pr'])

    expect(
      filterComposerPrompts({
        catalog,
        query: 'planning',
      }).map((entry) => entry.id),
    ).toEqual(['daily-plan'])
  })

  it('sorts project prompts before global prompts', () => {
    expect(
      filterComposerPrompts({
        catalog,
        query: '',
      }).map((entry) => entry.id),
    ).toEqual(['review-pr', 'daily-plan'])
  })

  it('returns no prompts without a catalog', () => {
    expect(filterComposerPrompts({ catalog: null, query: '' })).toEqual([])
  })
})
