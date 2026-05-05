import { describe, expect, it } from 'vitest'
import {
  buildPullRequestReviewBranchName,
  isPullRequestReviewBranchName,
  parsePullRequestReference,
  resolvePullRequestReference,
} from './pull-request-reference.pure'

describe('pull-request-reference', () => {
  it('parses supported pull request references', () => {
    expect(parsePullRequestReference('123')).toEqual({
      owner: null,
      name: null,
      number: 123,
    })
    expect(parsePullRequestReference('#123')).toEqual({
      owner: null,
      name: null,
      number: 123,
    })
    expect(parsePullRequestReference('acme/app#123')).toEqual({
      owner: 'acme',
      name: 'app',
      number: 123,
    })
    expect(
      parsePullRequestReference('https://github.com/acme/app/pull/123'),
    ).toEqual({
      owner: 'acme',
      name: 'app',
      number: 123,
    })
    expect(parsePullRequestReference('github.com/acme/app/pull/123')).toEqual({
      owner: 'acme',
      name: 'app',
      number: 123,
    })
  })

  it('rejects malformed references', () => {
    expect(() => parsePullRequestReference('')).toThrow(
      'Pull request reference is required',
    )
    expect(() => parsePullRequestReference('acme/app')).toThrow(
      'Enter a GitHub pull request URL',
    )
    expect(() => parsePullRequestReference('#0')).toThrow(
      'Pull request number must be a positive integer',
    )
  })

  it('resolves bare references against the project remote', () => {
    expect(
      resolvePullRequestReference({
        reference: parsePullRequestReference('123'),
        projectRemoteUrl: 'git@github.com:acme/app.git',
      }),
    ).toEqual({
      repository: { owner: 'acme', name: 'app' },
      number: 123,
    })
  })

  it('rejects repository mismatches', () => {
    expect(() =>
      resolvePullRequestReference({
        reference: parsePullRequestReference('other/app#123'),
        projectRemoteUrl: 'git@github.com:acme/app.git',
      }),
    ).toThrow('This Pull Request belongs to other/app')
  })

  it('builds and validates deterministic review branch names', () => {
    expect(buildPullRequestReviewBranchName(123)).toBe('convergence/pr-123')
    expect(isPullRequestReviewBranchName('convergence/pr-123')).toBe(true)
    expect(isPullRequestReviewBranchName('feature/pr-123')).toBe(false)
    expect(() => buildPullRequestReviewBranchName(0)).toThrow()
  })
})
