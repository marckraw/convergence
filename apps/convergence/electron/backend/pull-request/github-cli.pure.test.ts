import { describe, expect, it } from 'vitest'
import {
  classifyGithubCliError,
  parseGithubCliOpenPullRequests,
  parseGithubCliPullRequests,
  parseGithubRepositoryRef,
} from './github-cli.pure'

describe('parseGithubRepositoryRef', () => {
  it('parses common GitHub remote URL formats', () => {
    expect(parseGithubRepositoryRef('https://github.com/acme/app.git')).toEqual(
      {
        owner: 'acme',
        name: 'app',
      },
    )
    expect(parseGithubRepositoryRef('git@github.com:acme/app.git')).toEqual({
      owner: 'acme',
      name: 'app',
    })
    expect(parseGithubRepositoryRef('ssh://git@github.com/acme/app')).toEqual({
      owner: 'acme',
      name: 'app',
    })
  })

  it('rejects unsupported and malformed remotes', () => {
    expect(parseGithubRepositoryRef('git@gitlab.com:acme/app.git')).toBeNull()
    expect(
      parseGithubRepositoryRef('https://gitlab.com/acme/app.git'),
    ).toBeNull()
    expect(parseGithubRepositoryRef('https://github.com/acme')).toBeNull()
    expect(parseGithubRepositoryRef('not a url')).toBeNull()
    expect(parseGithubRepositoryRef(null)).toBeNull()
  })
})

describe('parseGithubCliPullRequests', () => {
  const repository = { owner: 'acme', name: 'app' }

  it('returns not-found when gh returns no matching PRs', () => {
    expect(
      parseGithubCliPullRequests('[]', repository, 'feature-x'),
    ).toMatchObject({
      lookupStatus: 'not-found',
      state: 'none',
      repositoryOwner: 'acme',
      repositoryName: 'app',
      headBranch: 'feature-x',
    })
  })

  it('returns error when gh returns malformed JSON', () => {
    expect(
      parseGithubCliPullRequests('{not-json', repository, 'feature-x'),
    ).toMatchObject({
      lookupStatus: 'error',
      state: 'unknown',
      error: 'GitHub CLI returned invalid JSON.',
      repositoryOwner: 'acme',
      repositoryName: 'app',
      headBranch: 'feature-x',
    })
  })

  it('normalizes an open pull request', () => {
    expect(
      parseGithubCliPullRequests(
        JSON.stringify([
          {
            number: 12,
            title: 'Feature X',
            url: 'https://github.com/acme/app/pull/12',
            state: 'OPEN',
            isDraft: false,
            mergedAt: null,
            headRefName: 'feature-x',
            baseRefName: 'main',
          },
        ]),
        repository,
        'feature-x',
      ),
    ).toMatchObject({
      lookupStatus: 'found',
      state: 'open',
      number: 12,
      title: 'Feature X',
      baseBranch: 'main',
    })
  })

  it('maps draft and merged states', () => {
    expect(
      parseGithubCliPullRequests(
        JSON.stringify([{ state: 'OPEN', isDraft: true }]),
        repository,
        'feature-x',
      ).state,
    ).toBe('draft')
    expect(
      parseGithubCliPullRequests(
        JSON.stringify([{ state: 'CLOSED', mergedAt: '2026-01-01T00:00:00Z' }]),
        repository,
        'feature-x',
      ).state,
    ).toBe('merged')
  })
})

describe('parseGithubCliOpenPullRequests', () => {
  it('normalizes open project pull requests', () => {
    expect(
      parseGithubCliOpenPullRequests(
        JSON.stringify([
          {
            number: 42,
            title: 'Review guide mode',
            url: 'https://github.com/acme/app/pull/42',
            state: 'OPEN',
            isDraft: false,
            headRefName: 'codewalk-feature',
            baseRefName: 'main',
            changedFiles: 12,
            updatedAt: '2026-01-05T00:00:00Z',
          },
          {
            number: 43,
            title: 'Draft work',
            state: 'OPEN',
            isDraft: true,
          },
        ]),
        { owner: 'acme', name: 'app' },
        'project-1',
      ),
    ).toEqual([
      {
        projectId: 'project-1',
        provider: 'github',
        state: 'open',
        repositoryOwner: 'acme',
        repositoryName: 'app',
        number: 42,
        title: 'Review guide mode',
        url: 'https://github.com/acme/app/pull/42',
        isDraft: false,
        headBranch: 'codewalk-feature',
        baseBranch: 'main',
        changedFileCount: 12,
        updatedAt: '2026-01-05T00:00:00Z',
      },
      {
        projectId: 'project-1',
        provider: 'github',
        state: 'draft',
        repositoryOwner: 'acme',
        repositoryName: 'app',
        number: 43,
        title: 'Draft work',
        url: null,
        isDraft: true,
        headBranch: null,
        baseBranch: null,
        changedFileCount: null,
        updatedAt: null,
      },
    ])
  })

  it('returns an empty list for malformed gh output', () => {
    expect(
      parseGithubCliOpenPullRequests(
        '{not-json',
        { owner: 'acme', name: 'app' },
        'project-1',
      ),
    ).toEqual([])
  })
})

describe('classifyGithubCliError', () => {
  it('detects missing gh and auth failures', () => {
    expect(classifyGithubCliError({ code: 'ENOENT' })).toBe('gh-unavailable')
    expect(
      classifyGithubCliError({
        stderr: 'You are not logged in. gh auth login',
      }),
    ).toBe('gh-auth-required')
  })
})
