import { describe, expect, it } from 'vitest'
import type {
  PromptLibraryCatalog,
  PromptLibraryEntry,
} from '@/entities/prompt-library'
import {
  collectPromptTags,
  filterPromptLibraryCatalog,
  findPrompt,
  firstPrompt,
  type PromptLibraryBrowserFilters,
} from './prompt-library-browser.pure'

const baseFilters: PromptLibraryBrowserFilters = {
  query: '',
  scope: 'all',
  kind: 'all',
  tag: 'all',
}

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

function catalog(): PromptLibraryCatalog {
  return {
    projectId: 'project-1',
    projectName: 'convergence',
    refreshedAt: '2026-05-13T00:00:00.000Z',
    roots: [],
    prompts: [
      prompt('review-pr', {
        description: 'Review pull requests.',
        tags: ['review', 'github'],
      }),
      prompt('daily-plan', {
        scope: 'global',
        sourceLabel: 'Global',
        kind: 'text',
        tags: ['planning'],
      }),
    ],
  }
}

describe('prompt library browser helpers', () => {
  it('matches query against prompt metadata', () => {
    expect(
      filterPromptLibraryCatalog(catalog(), {
        ...baseFilters,
        query: 'pull requests',
      }).map((entry) => entry.id),
    ).toEqual(['review-pr'])

    expect(
      filterPromptLibraryCatalog(catalog(), {
        ...baseFilters,
        query: 'planning',
      }).map((entry) => entry.id),
    ).toEqual(['daily-plan'])
  })

  it('filters by scope, kind, and tag', () => {
    expect(
      filterPromptLibraryCatalog(catalog(), {
        ...baseFilters,
        scope: 'global',
        kind: 'text',
        tag: 'planning',
      }).map((entry) => entry.id),
    ).toEqual(['daily-plan'])
  })

  it('finds selected and first prompts', () => {
    const prompts = filterPromptLibraryCatalog(catalog(), baseFilters)

    expect(findPrompt(prompts, 'daily-plan')?.title).toBe('daily-plan')
    expect(findPrompt(prompts, 'missing')).toBeNull()
    expect(firstPrompt(prompts)?.id).toBe('review-pr')
  })

  it('collects tag options', () => {
    expect(collectPromptTags(catalog())).toEqual([
      'github',
      'planning',
      'review',
    ])
  })
})
