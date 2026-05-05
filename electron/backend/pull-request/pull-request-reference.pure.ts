import { parseGithubRepositoryRef } from './github-cli.pure'
import type { GithubRepositoryRef } from './pull-request.types'

export interface PullRequestReference {
  owner: string | null
  name: string | null
  number: number
}

export interface PullRequestReferenceResolution {
  repository: GithubRepositoryRef
  number: number
}

const REVIEW_BRANCH_PREFIX = 'convergence/pr-'

export function buildPullRequestReviewBranchName(number: number): string {
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error('Pull request number must be a positive integer')
  }
  return `${REVIEW_BRANCH_PREFIX}${number}`
}

export function isPullRequestReviewBranchName(value: string): boolean {
  const match = value.match(/^convergence\/pr-(\d+)$/)
  return !!match && Number(match[1]) > 0
}

export function parsePullRequestReference(raw: string): PullRequestReference {
  const value = raw.trim()
  if (!value) {
    throw new Error('Pull request reference is required')
  }

  const bareMatch = value.match(/^#?(\d+)$/)
  if (bareMatch) {
    return {
      owner: null,
      name: null,
      number: parsePositiveNumber(bareMatch[1]),
    }
  }

  const shorthandMatch = value.match(
    /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/,
  )
  if (shorthandMatch) {
    return {
      owner: shorthandMatch[1],
      name: shorthandMatch[2].replace(/\.git$/i, ''),
      number: parsePositiveNumber(shorthandMatch[3]),
    }
  }

  const urlMatch = value.match(
    /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/i,
  )
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      name: urlMatch[2].replace(/\.git$/i, ''),
      number: parsePositiveNumber(urlMatch[3]),
    }
  }

  throw new Error(
    'Enter a GitHub pull request URL, number, or owner/repo#number reference',
  )
}

export function resolvePullRequestReference(input: {
  reference: PullRequestReference
  projectRemoteUrl: string | null
}): PullRequestReferenceResolution {
  const projectRepository = parseGithubRepositoryRef(input.projectRemoteUrl)
  if (!projectRepository) {
    throw new Error(
      input.projectRemoteUrl
        ? "This Project's origin remote is not a github.com repository."
        : 'No origin remote configured for this Project.',
    )
  }

  if (!input.reference.owner || !input.reference.name) {
    return {
      repository: projectRepository,
      number: input.reference.number,
    }
  }

  const referencedRepository = {
    owner: input.reference.owner,
    name: input.reference.name,
  }

  if (!sameRepository(projectRepository, referencedRepository)) {
    throw new Error(
      `This Pull Request belongs to ${referencedRepository.owner}/${referencedRepository.name}, but the active Project uses ${projectRepository.owner}/${projectRepository.name}.`,
    )
  }

  return {
    repository: projectRepository,
    number: input.reference.number,
  }
}

function sameRepository(
  left: GithubRepositoryRef,
  right: GithubRepositoryRef,
): boolean {
  return (
    left.owner.toLowerCase() === right.owner.toLowerCase() &&
    left.name.toLowerCase() === right.name.toLowerCase()
  )
}

function parsePositiveNumber(value: string | undefined): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error('Pull request number must be a positive integer')
  }
  return number
}
