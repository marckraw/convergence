import { execFile } from 'child_process'
import type { ProjectService } from '../project/project.service'
import type { Project } from '../project/project.types'
import type { WorkspaceService } from '../workspace/workspace.service'
import type { GitService } from '../git/git.service'
import type { SessionService } from '../session/session.service'
import type { PullRequestService } from './pull-request.service'
import type {
  GithubCliPullRequestViewJson,
  GithubRepositoryRef,
  PullRequestLookupResult,
  PullRequestState,
} from './pull-request.types'
import {
  buildPullRequestReviewBranchName,
  parsePullRequestReference,
} from './pull-request-reference.pure'
import type { PullRequestReference } from './pull-request-reference.pure'
import { buildPullRequestReviewPrompt } from './pull-request-review-prompt.pure'
import {
  classifyGithubCliError,
  parseGithubRepositoryRef,
} from './github-cli.pure'
import type {
  PreparePullRequestReviewSessionInput,
  PullRequestReviewPreview,
  PullRequestReviewSessionResult,
} from './pull-request-review.types'

interface GhExecError extends Error {
  code?: unknown
  killed?: boolean
  signal?: NodeJS.Signals | null
  stderr?: string
}

const GH_LOOKUP_TIMEOUT_MS = 15_000

function execGh(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      args,
      { cwd, timeout: GH_LOOKUP_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          const nextError = error as GhExecError
          nextError.stderr = stderr
          reject(nextError)
          return
        }
        resolve(stdout.trimEnd())
      },
    )
  })
}

export class PullRequestReviewService {
  constructor(
    private readonly deps: {
      projects: ProjectService
      workspaces: WorkspaceService
      git: GitService
      pullRequests: PullRequestService
      sessions: SessionService
    },
  ) {}

  async previewReview(input: {
    projectId?: string | null
    reference: string
  }): Promise<PullRequestReviewPreview> {
    const { project, repository, number } =
      await this.resolveProjectReference(input)
    const lookup = await this.resolveGithubPullRequest({
      repository,
      number,
      cwd: project.repositoryPath,
    })

    if (lookup.lookupStatus !== 'found') {
      throw new Error(lookup.error ?? `Pull Request #${number} was not found.`)
    }

    return {
      projectId: project.id,
      projectName: project.name,
      repositoryOwner: repository.owner,
      repositoryName: repository.name,
      number,
      title: lookup.title,
      url: lookup.url,
      state: lookup.state,
      isDraft: lookup.isDraft,
      headBranch: lookup.headBranch,
      baseBranch: lookup.baseBranch,
      mergedAt: lookup.mergedAt,
      reviewBranchName: buildPullRequestReviewBranchName(number),
    }
  }

  async prepareReviewSession(
    input: PreparePullRequestReviewSessionInput,
  ): Promise<PullRequestReviewSessionResult> {
    const { project, repository, number } =
      await this.resolveProjectReference(input)
    const lookup = await this.resolveGithubPullRequest({
      repository,
      number,
      cwd: project.repositoryPath,
    })

    if (lookup.lookupStatus !== 'found') {
      throw new Error(lookup.error ?? `Pull Request #${number} was not found.`)
    }

    const branchName = buildPullRequestReviewBranchName(number)
    let workspace = this.deps.workspaces.getByProjectIdAndBranch(
      project.id,
      branchName,
    )

    if (workspace) {
      const status = await this.deps.git.getStatus(workspace.path)
      if (status.length > 0) {
        throw new Error(
          'The existing review Workspace has local changes. Clean or archive it before refreshing this Pull Request.',
        )
      }
      await this.deps.git.updateWorktreeToPullRequestHead({
        worktreePath: workspace.path,
        number,
      })
    } else {
      await this.deps.git.fetchPullRequestHead({
        repoPath: project.repositoryPath,
        number,
        localBranch: branchName,
      })
      workspace = await this.deps.workspaces.create({
        projectId: project.id,
        branchName,
      })
    }

    const cachedPullRequest = this.deps.pullRequests.upsertForWorkspace({
      projectId: project.id,
      workspaceId: workspace.id,
      result: lookup,
    })

    const sessionName =
      input.sessionName?.trim() ||
      `Review PR #${number}: ${lookup.title ?? 'Untitled PR'}`
    const session = this.deps.sessions.create({
      projectId: project.id,
      workspaceId: workspace.id,
      providerId: input.providerId,
      model: input.model,
      effort: input.effort,
      name: sessionName,
    })

    const prompt = buildPullRequestReviewPrompt({
      number,
      title: lookup.title,
      repositoryOwner: repository.owner,
      repositoryName: repository.name,
      url: lookup.url,
      baseBranch: lookup.baseBranch,
      headBranch: lookup.headBranch,
      workspacePath: workspace.path,
    })

    await this.deps.sessions.start(session.id, { text: prompt })

    return {
      workspace,
      pullRequest: cachedPullRequest,
      session: this.deps.sessions.getSummaryById(session.id) ?? session,
    }
  }

  private async resolveProjectReference(input: {
    projectId?: string | null
    reference: string
  }): Promise<{
    project: Project
    repository: GithubRepositoryRef
    number: number
  }> {
    const reference = parsePullRequestReference(input.reference)
    const resolved = reference.owner
      ? await this.resolveRepositoryReference(reference)
      : await this.resolveActiveProjectReference(input.projectId, reference)

    return {
      project: resolved.project,
      repository: resolved.repository,
      number: reference.number,
    }
  }

  private async resolveActiveProjectReference(
    projectId: string | null | undefined,
    reference: PullRequestReference,
  ): Promise<{
    project: Project
    repository: GithubRepositoryRef
  }> {
    if (!projectId) {
      throw new Error(
        'Enter a GitHub pull request URL or select a Project before using a bare pull request number.',
      )
    }

    const project = this.deps.projects.getById(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const remoteUrl = await this.deps.git.getRemoteUrl(project.repositoryPath)
    const repository = parseGithubRepositoryRef(remoteUrl)
    if (!repository) {
      throw new Error(
        remoteUrl
          ? "This Project's origin remote is not a github.com repository."
          : 'No origin remote configured for this Project.',
      )
    }

    if (reference.owner || reference.name) {
      const referencedRepository = {
        owner: reference.owner ?? '',
        name: reference.name ?? '',
      }
      if (!sameRepository(repository, referencedRepository)) {
        throw new Error(
          `This Pull Request belongs to ${referencedRepository.owner}/${referencedRepository.name}, but the active Project uses ${repository.owner}/${repository.name}.`,
        )
      }
    }

    return { project, repository }
  }

  private async resolveRepositoryReference(
    reference: PullRequestReference,
  ): Promise<{
    project: Project
    repository: GithubRepositoryRef
  }> {
    if (!reference.owner || !reference.name) {
      throw new Error('Pull request repository is required')
    }

    const referencedRepository = {
      owner: reference.owner,
      name: reference.name,
    }
    const matches: Array<{
      project: Project
      repository: GithubRepositoryRef
    }> = []

    for (const project of this.deps.projects.getAll()) {
      const remoteUrl = await this.deps.git.getRemoteUrl(project.repositoryPath)
      const repository = parseGithubRepositoryRef(remoteUrl)
      if (repository && sameRepository(repository, referencedRepository)) {
        matches.push({ project, repository })
      }
    }

    if (matches.length === 0) {
      throw new Error(
        `No Convergence Project is configured for ${referencedRepository.owner}/${referencedRepository.name}. Add that repository as a Project first.`,
      )
    }

    if (matches.length > 1) {
      const projectNames = matches
        .map((match) => match.project.name)
        .sort((left, right) => left.localeCompare(right))
        .join(', ')
      throw new Error(
        `Multiple Convergence Projects use ${referencedRepository.owner}/${referencedRepository.name}: ${projectNames}. Select the target Project and use the bare pull request number.`,
      )
    }

    return matches[0]
  }

  private async resolveGithubPullRequest(input: {
    repository: GithubRepositoryRef
    number: number
    cwd: string
  }): Promise<PullRequestLookupResult> {
    try {
      const stdout = await execGh(
        [
          'pr',
          'view',
          String(input.number),
          '--repo',
          `${input.repository.owner}/${input.repository.name}`,
          '--json',
          'number,title,url,state,isDraft,mergedAt,headRefName,baseRefName',
        ],
        input.cwd,
      )
      return parsePullRequestView(stdout, input.repository, input.number)
    } catch (err) {
      const error = err as GhExecError
      const status = classifyGithubCliError(error)
      const stderr = error.stderr?.trim() ?? ''
      const missing = `${stderr}\n${error.message ?? ''}`.toLowerCase()
      const lookupStatus =
        status === 'error' &&
        (missing.includes('not found') || missing.includes('could not resolve'))
          ? 'not-found'
          : status
      return {
        provider: 'github',
        lookupStatus,
        state: 'unknown',
        repositoryOwner: input.repository.owner,
        repositoryName: input.repository.name,
        number: input.number,
        title: null,
        url: null,
        isDraft: false,
        headBranch: null,
        baseBranch: null,
        mergedAt: null,
        error:
          lookupStatus === 'gh-unavailable'
            ? 'GitHub CLI (gh) is not available on PATH.'
            : lookupStatus === 'gh-auth-required'
              ? 'GitHub CLI is not authenticated. Run gh auth login.'
              : lookupStatus === 'not-found'
                ? `Pull Request #${input.number} was not found in ${input.repository.owner}/${input.repository.name}.`
                : error.killed || error.signal
                  ? 'GitHub CLI timed out while looking up pull request.'
                  : stderr || error.message || 'GitHub CLI failed.',
      }
    }
  }
}

function parsePullRequestView(
  stdout: string,
  repository: GithubRepositoryRef,
  fallbackNumber: number,
): PullRequestLookupResult {
  let parsed: GithubCliPullRequestViewJson
  try {
    parsed = JSON.parse(stdout) as GithubCliPullRequestViewJson
  } catch {
    return {
      provider: 'github',
      lookupStatus: 'error',
      state: 'unknown',
      repositoryOwner: repository.owner,
      repositoryName: repository.name,
      number: fallbackNumber,
      title: null,
      url: null,
      isDraft: false,
      headBranch: null,
      baseBranch: null,
      mergedAt: null,
      error: 'GitHub CLI returned invalid JSON.',
    }
  }

  return {
    provider: 'github',
    lookupStatus: 'found',
    state: mapGithubState(parsed),
    repositoryOwner: repository.owner,
    repositoryName: repository.name,
    number: typeof parsed.number === 'number' ? parsed.number : fallbackNumber,
    title: typeof parsed.title === 'string' ? parsed.title : null,
    url: typeof parsed.url === 'string' ? parsed.url : null,
    isDraft: parsed.isDraft === true,
    headBranch:
      typeof parsed.headRefName === 'string' ? parsed.headRefName : null,
    baseBranch:
      typeof parsed.baseRefName === 'string' ? parsed.baseRefName : null,
    mergedAt: typeof parsed.mergedAt === 'string' ? parsed.mergedAt : null,
    error: null,
  }
}

function mapGithubState(pr: GithubCliPullRequestViewJson): PullRequestState {
  const state = pr.state?.toUpperCase()
  if (pr.isDraft === true && state === 'OPEN') return 'draft'
  if (state === 'OPEN') return 'open'
  if (state === 'MERGED' || pr.mergedAt) return 'merged'
  if (state === 'CLOSED') return 'closed'
  return 'unknown'
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
