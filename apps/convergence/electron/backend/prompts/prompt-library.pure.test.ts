import { describe, expect, it } from 'vitest'
import {
  buildPromptLibraryEntry,
  parsePromptFrontmatter,
  promptKindFromPath,
  promptTagsFromField,
  stripPromptFrontmatter,
} from './prompt-library.pure'

describe('prompt-library pure helpers', () => {
  it('parses frontmatter and strips it from copied prompt text', () => {
    const markdown = [
      '---',
      'title: Review PR',
      'description: Inspect a pull request.',
      'tags: review, github',
      '---',
      '# Prompt',
      '',
      'Review this PR.',
    ].join('\n')

    expect(parsePromptFrontmatter(markdown).fields).toMatchObject({
      title: 'Review PR',
      description: 'Inspect a pull request.',
      tags: 'review, github',
    })
    expect(stripPromptFrontmatter(markdown)).toBe('# Prompt\n\nReview this PR.')
  })

  it('builds catalog metadata from frontmatter and path fallback', () => {
    const entry = buildPromptLibraryEntry({
      path: '/repo/.convergence/prompts/review-pr.md',
      rootPath: '/repo/.convergence/prompts',
      scope: 'project',
      markdown: [
        '---',
        'title: Review PR',
        'tags: review, github',
        '---',
        'Review a pull request.',
      ].join('\n'),
      sizeBytes: 85,
    })

    expect(entry).toMatchObject({
      title: 'Review PR',
      description: 'Review a pull request.',
      relativePath: 'review-pr.md',
      sourceLabel: 'Project',
      kind: 'markdown',
      tags: ['review', 'github'],
      sizeBytes: 85,
    })
    expect(entry.id).toMatch(/^prompt:project:/)
  })

  it('detects supported file kinds and tag lists', () => {
    expect(promptKindFromPath('/tmp/a.md')).toBe('markdown')
    expect(promptKindFromPath('/tmp/a.markdown')).toBe('markdown')
    expect(promptKindFromPath('/tmp/a.txt')).toBe('text')
    expect(promptKindFromPath('/tmp/a.json')).toBeNull()
    expect(promptTagsFromField('[review, github]')).toEqual([
      'review',
      'github',
    ])
  })
})
