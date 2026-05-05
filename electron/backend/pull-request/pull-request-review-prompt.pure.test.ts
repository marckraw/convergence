import { describe, expect, it } from 'vitest'
import { buildPullRequestReviewPrompt } from './pull-request-review-prompt.pure'

describe('buildPullRequestReviewPrompt', () => {
  it('renders review instructions with pull request metadata', () => {
    const prompt = buildPullRequestReviewPrompt({
      number: 123,
      title: 'Add review workflow',
      repositoryOwner: 'acme',
      repositoryName: 'app',
      url: 'https://github.com/acme/app/pull/123',
      baseBranch: 'main',
      headBranch: 'feature/review',
      workspacePath: '/tmp/workspace',
    })

    expect(prompt).toContain('Please review Pull Request #123')
    expect(prompt).toContain('Repository: acme/app')
    expect(prompt).toContain('Base branch: main')
    expect(prompt).toContain('Head branch: feature/review')
    expect(prompt).toContain('Local workspace: /tmp/workspace')
    expect(prompt).toContain('Return findings first')
    expect(prompt).toContain('Do not make code changes')
  })
})
