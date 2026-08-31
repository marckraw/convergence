import type {
  GithubCliPullRequestJson,
  GithubRepositoryRef,
  ProjectPullRequest,
  PullRequestLookupResult,
  PullRequestState,
} from './pull-request.types'

export function parseGithubRepositoryRef(
  remoteUrl: string | null,
): GithubRepositoryRef | null {
  if (!remoteUrl) return null
  const trimmed = remoteUrl.trim()

  const httpsMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[#?].*)?$/i,
  )
  if (httpsMatch) {
    return normalizeRepoRef(httpsMatch[1], httpsMatch[2])
  }

  const scpMatch = trimmed.match(
    /^(?:[^@]+@)?github\.com:([^/]+)\/([^/#?]+?)(?:\.git)?$/i,
  )
  if (scpMatch) {
    return normalizeRepoRef(scpMatch[1], scpMatch[2])
  }

  const sshMatch = trimmed.match(
    /^ssh:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[#?].*)?$/i,
  )
  if (sshMatch) {
    return normalizeRepoRef(sshMatch[1], sshMatch[2])
  }

  return null
}

export function parseGithubCliPullRequests(
  stdout: string,
  repository: GithubRepositoryRef,
  branchName: string,
): PullRequestLookupResult {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return notFound(repository, branchName)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return {
      ...notFound(repository, branchName),
      lookupStatus: 'error',
      state: 'unknown',
      error: 'GitHub CLI returned invalid JSON.',
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return notFound(repository, branchName)
  }

  const candidates = parsed as GithubCliPullRequestJson[]
  const pr =
    candidates.find((candidate) => candidate.headRefName === branchName) ??
    candidates[0]

  return {
    provider: 'github',
    lookupStatus: 'found',
    state: mapGithubState(pr),
    repositoryOwner: repository.owner,
    repositoryName: repository.name,
    number: typeof pr.number === 'number' ? pr.number : null,
    title: typeof pr.title === 'string' ? pr.title : null,
    url: typeof pr.url === 'string' ? pr.url : null,
    isDraft: pr.isDraft === true,
    headBranch:
      typeof pr.headRefName === 'string' ? pr.headRefName : branchName,
    baseBranch: typeof pr.baseRefName === 'string' ? pr.baseRefName : null,
    mergedAt: typeof pr.mergedAt === 'string' ? pr.mergedAt : null,
    error: null,
  }
}

export function parseGithubCliOpenPullRequests(
  stdout: string,
  repository: GithubRepositoryRef,
  projectId: string,
): ProjectPullRequest[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  return parsed.flatMap((value): ProjectPullRequest[] => {
    const pr = value as GithubCliPullRequestJson
    if (typeof pr.number !== 'number') return []

    return [
      {
        projectId,
        provider: 'github',
        state: mapOpenPullRequestState(pr),
        repositoryOwner: repository.owner,
        repositoryName: repository.name,
        number: pr.number,
        title: typeof pr.title === 'string' ? pr.title : null,
        url: typeof pr.url === 'string' ? pr.url : null,
        isDraft: pr.isDraft === true,
        headBranch: typeof pr.headRefName === 'string' ? pr.headRefName : null,
        baseBranch: typeof pr.baseRefName === 'string' ? pr.baseRefName : null,
        changedFileCount:
          typeof pr.changedFiles === 'number' ? pr.changedFiles : null,
        updatedAt: typeof pr.updatedAt === 'string' ? pr.updatedAt : null,
      },
    ]
  })
}

export function classifyGithubCliError(error: {
  code?: unknown
  message?: string
  stderr?: string
}): Extract<
  PullRequestLookupResult['lookupStatus'],
  'gh-unavailable' | 'gh-auth-required' | 'error'
> {
  if (error.code === 'ENOENT') return 'gh-unavailable'
  const text = `${error.stderr ?? ''}\n${error.message ?? ''}`.toLowerCase()
  if (
    text.includes('not logged in') ||
    text.includes('authentication') ||
    text.includes('authenticate') ||
    text.includes('gh auth login') ||
    text.includes('oauth')
  ) {
    return 'gh-auth-required'
  }
  return 'error'
}

function normalizeRepoRef(
  owner: string | undefined,
  name: string | undefined,
): GithubRepositoryRef | null {
  const normalizedOwner = owner?.trim()
  const normalizedName = name?.trim().replace(/\.git$/i, '')
  if (!normalizedOwner || !normalizedName) return null
  return { owner: normalizedOwner, name: normalizedName }
}

function notFound(
  repository: GithubRepositoryRef,
  branchName: string,
): PullRequestLookupResult {
  return {
    provider: 'github',
    lookupStatus: 'not-found',
    state: 'none',
    repositoryOwner: repository.owner,
    repositoryName: repository.name,
    number: null,
    title: null,
    url: null,
    isDraft: false,
    headBranch: branchName,
    baseBranch: null,
    mergedAt: null,
    error: null,
  }
}

function mapGithubState(pr: GithubCliPullRequestJson): PullRequestState {
  const state = pr.state?.toUpperCase()
  if (pr.isDraft === true && state === 'OPEN') return 'draft'
  if (state === 'OPEN') return 'open'
  if (state === 'MERGED' || pr.mergedAt) return 'merged'
  if (state === 'CLOSED') return 'closed'
  return 'unknown'
}

function mapOpenPullRequestState(
  pr: GithubCliPullRequestJson,
): ProjectPullRequest['state'] {
  if (pr.isDraft === true) return 'draft'
  if (pr.state?.toUpperCase() === 'OPEN') return 'open'
  return 'unknown'
}
