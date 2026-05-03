import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { WorkspacePullRequestRow } from '../database/database.types'
import { GitService } from '../git/git.service'
import {
  classifyGithubCliError,
  parseGithubCliPullRequests,
  parseGithubRepositoryRef,
} from './github-cli.pure'
import {
  workspacePullRequestFromRow,
  type PullRequestLookupResult,
  type WorkspacePullRequest,
} from './pull-request.types'

interface GhExecError extends Error {
  code?: unknown
  stderr?: string
}

function execGh(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        const nextError = error as GhExecError
        nextError.stderr = stderr
        reject(nextError)
        return
      }
      resolve(stdout.trimEnd())
    })
  })
}

export class PullRequestService {
  constructor(
    private db: Database.Database,
    private git: GitService,
  ) {}

  getByWorkspaceId(workspaceId: string): WorkspacePullRequest | null {
    const row = this.db
      .prepare('SELECT * FROM workspace_pull_requests WHERE workspace_id = ?')
      .get(workspaceId) as WorkspacePullRequestRow | undefined

    return row ? workspacePullRequestFromRow(row) : null
  }

  async refreshForSession(
    sessionId: string,
  ): Promise<WorkspacePullRequest | null> {
    const session = this.db
      .prepare(
        `SELECT id, project_id, workspace_id, working_directory
         FROM sessions
         WHERE id = ?`,
      )
      .get(sessionId) as
      | {
          id: string
          project_id: string
          workspace_id: string | null
          working_directory: string
        }
      | undefined

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (!session.workspace_id) {
      return null
    }

    const workspace = this.db
      .prepare('SELECT id FROM workspaces WHERE id = ?')
      .get(session.workspace_id) as { id: string } | undefined

    if (!workspace) {
      return null
    }

    const lookup = await this.lookupGithubPullRequest(session.working_directory)
    this.upsertWorkspacePullRequest({
      projectId: session.project_id,
      workspaceId: session.workspace_id,
      result: lookup,
    })

    return this.getByWorkspaceId(session.workspace_id)
  }

  private async lookupGithubPullRequest(
    workingDirectory: string,
  ): Promise<PullRequestLookupResult> {
    const branchName = await this.git.getCurrentBranch(workingDirectory)
    const remoteUrl = await this.git.getRemoteUrl(workingDirectory)
    const repository = parseGithubRepositoryRef(remoteUrl)

    if (!repository) {
      return {
        provider: 'unknown',
        lookupStatus: 'unsupported-remote',
        state: 'unknown',
        repositoryOwner: null,
        repositoryName: null,
        number: null,
        title: null,
        url: null,
        isDraft: false,
        headBranch: branchName,
        baseBranch: null,
        mergedAt: null,
        error: remoteUrl
          ? 'Remote is not a github.com repository.'
          : 'No origin remote configured.',
      }
    }

    try {
      const stdout = await execGh(
        [
          'pr',
          'list',
          '--repo',
          `${repository.owner}/${repository.name}`,
          '--head',
          branchName,
          '--state',
          'all',
          '--json',
          'number,title,url,state,isDraft,mergedAt,headRefName,baseRefName',
          '--limit',
          '10',
        ],
        workingDirectory,
      )
      return parseGithubCliPullRequests(stdout, repository, branchName)
    } catch (err) {
      const error = err as GhExecError
      const lookupStatus = classifyGithubCliError(error)
      return {
        provider: 'github',
        lookupStatus,
        state: 'unknown',
        repositoryOwner: repository.owner,
        repositoryName: repository.name,
        number: null,
        title: null,
        url: null,
        isDraft: false,
        headBranch: branchName,
        baseBranch: null,
        mergedAt: null,
        error:
          lookupStatus === 'gh-unavailable'
            ? 'GitHub CLI (gh) is not available on PATH.'
            : lookupStatus === 'gh-auth-required'
              ? 'GitHub CLI is not authenticated. Run gh auth login.'
              : error.stderr?.trim() || error.message || 'GitHub CLI failed.',
      }
    }
  }

  private upsertWorkspacePullRequest(input: {
    projectId: string
    workspaceId: string
    result: PullRequestLookupResult
  }): void {
    const existing = this.getByWorkspaceId(input.workspaceId)
    const id = existing?.id ?? randomUUID()
    const now = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO workspace_pull_requests (
           id,
           project_id,
           workspace_id,
           provider,
           lookup_status,
           state,
           repository_owner,
           repository_name,
           number,
           title,
           url,
           is_draft,
           head_branch,
           base_branch,
           merged_at,
           last_checked_at,
           error,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET
           project_id = excluded.project_id,
           provider = excluded.provider,
           lookup_status = excluded.lookup_status,
           state = excluded.state,
           repository_owner = excluded.repository_owner,
           repository_name = excluded.repository_name,
           number = excluded.number,
           title = excluded.title,
           url = excluded.url,
           is_draft = excluded.is_draft,
           head_branch = excluded.head_branch,
           base_branch = excluded.base_branch,
           merged_at = excluded.merged_at,
           last_checked_at = excluded.last_checked_at,
           error = excluded.error,
           updated_at = excluded.updated_at`,
      )
      .run(
        id,
        input.projectId,
        input.workspaceId,
        input.result.provider,
        input.result.lookupStatus,
        input.result.state,
        input.result.repositoryOwner,
        input.result.repositoryName,
        input.result.number,
        input.result.title,
        input.result.url,
        input.result.isDraft ? 1 : 0,
        input.result.headBranch,
        input.result.baseBranch,
        input.result.mergedAt,
        now,
        input.result.error,
        existing?.createdAt ?? now,
        now,
      )
  }
}
