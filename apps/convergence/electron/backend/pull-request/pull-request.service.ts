import { parseReportedWorkspace } from '../session/reported-workspace.pure'
import { parseSessionWorkAddress } from '../../../src/shared/lib/work-address.pure'
import {
  parseSessionPullRequest,
  readSessionPullRequest,
} from './session-pull-request.pure'
import type { SessionPullRequestPart } from './session-pull-request.pure'
import type { SessionPullRequestReading } from '../../../src/shared/types/session-pull-request.types'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { WorkspacePullRequestRow } from '../database/database.types'
import { GitService } from '../git/git.service'
import {
  classifyGithubCliError,
  parseGithubCliOpenPullRequests,
  parseGithubCliPullRequests,
  parseGithubRepositoryRef,
} from './github-cli.pure'
import {
  workspacePullRequestFromRow,
  type ProjectPullRequest,
  type PullRequestLookupResult,
  type WorkspacePullRequest,
} from './pull-request.types'

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

export class PullRequestService {
  private readonly readings = new Map<string, SessionPullRequestReading>()
  private readonly inFlight = new Map<
    string,
    Promise<SessionPullRequestReading>
  >()
  private onChanged: (sessionId: string) => void = () => {}
  private timer: ReturnType<typeof setInterval> | null = null

  start(onChanged: (sessionId: string) => void): void {
    this.onChanged = onChanged
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.pollOpenSessions().catch((error) => {
        console.error('[pull-request] open PR poll failed', error)
      })
    }, 10 * 60_000)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async pollOpenSessions(): Promise<void> {
    const rows = this.db
      .prepare(
        "SELECT id FROM sessions WHERE json_valid(pull_request_json) AND json_extract(pull_request_json, '$.state') IN ('open', 'draft')",
      )
      .all() as { id: string }[]
    for (const row of rows) await this.refreshForSession(row.id)
  }

  private sessionTarget(sessionId: string) {
    const row = this.db
      .prepare(
        `SELECT s.*, w.branch_name, p.repository_path FROM sessions s
      LEFT JOIN workspaces w ON w.id=s.workspace_id LEFT JOIN projects p ON p.id=s.project_id WHERE s.id=?`,
      )
      .get(sessionId) as
      | {
          id: string
          project_id: string
          workspace_id: string | null
          working_directory: string
          execution_host: string
          reported_workspace: string | null
          work_address: string | null
          pull_request_json: string | null
          branch_name: string | null
          repository_path: string | null
        }
      | undefined
    if (!row) throw new Error(`Session not found: ${sessionId}`)
    const remote = row.execution_host !== 'local'
    const reported = parseReportedWorkspace(row.reported_workspace)
    const address = parseSessionWorkAddress(row.work_address)
    const branchName = remote
      ? (reported?.branchName ?? null)
      : (row.branch_name ??
        (address?.mode === 'repository' ? address.branchName : null))
    return {
      row,
      branchName,
      cwd: remote
        ? (row.repository_path ?? process.cwd())
        : row.working_directory,
      repository:
        remote && reported?.mode === 'repository' ? reported.repository : null,
    }
  }

  evictDeletedSessions(): void {
    const exists = this.db.prepare('SELECT 1 FROM sessions WHERE id=?')
    for (const id of this.readings.keys()) {
      if (!exists.get(id)) this.readings.delete(id)
    }
  }

  getForSession(sessionId: string): SessionPullRequestReading {
    const { row, branchName } = this.sessionTarget(sessionId)
    if (!branchName)
      return {
        pullRequest: null,
        branchName: null,
        message: 'no branch recorded for this session',
      }
    return (
      this.readings.get(sessionId) ?? {
        pullRequest: parseSessionPullRequest(row.pull_request_json),
        branchName,
        message: null,
      }
    )
  }

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

  listByProjectId(projectId: string): WorkspacePullRequest[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM workspace_pull_requests
         WHERE project_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(projectId) as WorkspacePullRequestRow[]

    return rows.map(workspacePullRequestFromRow)
  }

  async listOpenByProjectId(projectId: string): Promise<ProjectPullRequest[]> {
    const project = this.db
      .prepare('SELECT id, repository_path FROM projects WHERE id = ?')
      .get(projectId) as { id: string; repository_path: string } | undefined

    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    const remoteUrl = await this.git.getRemoteUrl(project.repository_path)
    const repository = parseGithubRepositoryRef(remoteUrl)
    if (!repository) return []

    try {
      const stdout = await execGh(
        [
          'pr',
          'list',
          '--repo',
          `${repository.owner}/${repository.name}`,
          '--state',
          'open',
          '--json',
          'number,title,url,state,isDraft,headRefName,baseRefName,changedFiles,updatedAt',
          '--limit',
          '100',
        ],
        project.repository_path,
      )
      return parseGithubCliOpenPullRequests(stdout, repository, project.id)
    } catch {
      return []
    }
  }

  refreshForSession(sessionId: string): Promise<SessionPullRequestReading> {
    const pending = this.inFlight.get(sessionId)
    if (pending) return pending
    const request = this.refresh(sessionId).finally(() =>
      this.inFlight.delete(sessionId),
    )
    this.inFlight.set(sessionId, request)
    return request
  }

  private async refresh(sessionId: string): Promise<SessionPullRequestReading> {
    const { row, branchName, cwd, repository } = this.sessionTarget(sessionId)
    const lookup = branchName
      ? await this.lookupGithubPullRequest(cwd, branchName, repository)
      : null
    if (!this.db.prepare('SELECT 1 FROM sessions WHERE id=?').get(sessionId)) {
      this.readings.delete(sessionId)
      return {
        pullRequest: null,
        branchName: null,
        message: 'Session was deleted',
      }
    }
    // The same read decides whether gh's reply becomes a fact and, when it does
    // not, which part of it the reader is told about.
    const reply =
      lookup?.lookupStatus === 'found'
        ? readSessionPullRequest(
            JSON.stringify({
              number: lookup.number,
              url: lookup.url,
              state: lookup.state,
              headBranch: branchName,
              checkedAt: new Date().toISOString(),
              source: 'gh',
            }),
          )
        : null
    const found = reply?.fact ?? null
    const answered = found !== null || lookup?.lookupStatus === 'not-found'
    const pullRequest =
      found ??
      (lookup && !answered
        ? parseSessionPullRequest(row.pull_request_json)
        : null)
    const reading = {
      pullRequest,
      branchName,
      message: !branchName
        ? 'no branch recorded for this session'
        : reply?.unreadable
          ? unusableGithubReply[reply.unreadable]
          : lookup?.lookupStatus === 'gh-unavailable'
            ? 'PR unknown — gh not found'
            : lookup?.lookupStatus === 'not-found'
              ? 'No PR for this branch'
              : (lookup?.error ?? null),
    }
    // This is the sole writer of the session PR fact. No daemon hint is stored.
    if (answered) {
      this.db
        .prepare('UPDATE sessions SET pull_request_json=? WHERE id=?')
        .run(pullRequest ? JSON.stringify(pullRequest) : null, sessionId)
    }
    if (row.workspace_id && lookup && answered)
      this.upsertWorkspacePullRequest({
        projectId: row.project_id,
        workspaceId: row.workspace_id,
        result: lookup,
      })
    this.readings.set(sessionId, reading)
    this.onChanged(sessionId)
    return reading
  }

  upsertForWorkspace(input: {
    projectId: string
    workspaceId: string
    result: PullRequestLookupResult
  }): WorkspacePullRequest {
    this.upsertWorkspacePullRequest(input)
    const pullRequest = this.getByWorkspaceId(input.workspaceId)
    if (!pullRequest) {
      throw new Error(
        `Failed to read cached pull request for workspace ${input.workspaceId}`,
      )
    }
    return pullRequest
  }

  private async lookupGithubPullRequest(
    workingDirectory: string,
    branchName: string,
    recordedRepository: string | null,
  ): Promise<PullRequestLookupResult> {
    const remoteUrl =
      recordedRepository ?? (await this.git.getRemoteUrl(workingDirectory))
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
              : error.killed || error.signal
                ? 'GitHub CLI timed out while looking up pull request.'
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

/**
 * Why a `found` reply from gh could not become a PR fact (MAR-2991).
 *
 * `parseSessionPullRequest` refuses a reading that is missing any of its parts,
 * and the one message that stood here named only the first of them: a PR whose
 * state `mapGithubState` could not classify — a `state` gh did not send, or one
 * this build does not know — was reported as "gh answered without a PR number"
 * while carrying a perfectly good number. Each cause says its own name, so the
 * reader is told the thing that is actually wrong.
 *
 * The name comes from the parser, which is the only thing that decides; this is
 * a translation, not a second copy of the rule. Keyed by the parser's own parts
 * so tightening one — an http-only URL, say — cannot leave a bad URL reading as
 * "without a usable state": the missing key is a type error here first.
 *
 * The last three parts this service supplies itself rather than reading from gh
 * (the head branch, the check stamp, the source), so they say so instead of
 * blaming the reply.
 */
const unusableGithubReply: Record<SessionPullRequestPart, string> = {
  json: 'gh answered with a reply this build could not read',
  number: 'gh answered without a PR number',
  url: 'gh answered without a PR URL',
  state: 'gh answered without a usable state',
  headBranch: 'no branch to record this PR against',
  checkedAt: 'this build could not stamp the lookup',
  source: 'this build could not name the lookup’s source',
}
