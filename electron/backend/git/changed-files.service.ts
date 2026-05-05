import type Database from 'better-sqlite3'
import type {
  ProjectRow,
  SessionRow,
  WorkspacePullRequestRow,
} from '../database/database.types'
import { normalizeProjectSettings } from '../project/project-settings.pure'
import { GitService } from './git.service'
import {
  mergeChangedFileLists,
  selectBaseBranchCandidate,
} from './base-branch-diff.pure'
import type {
  BaseBranchDiffRequest,
  BaseBranchDiffSummary,
  ResolvedBaseBranch,
} from './changed-files.types'

interface SessionContextRow {
  session: SessionRow
  project: ProjectRow
  pullRequest: WorkspacePullRequestRow | null
}

export class ChangedFilesService {
  constructor(
    private db: Database.Database,
    private git: GitService,
  ) {}

  async getBaseBranchStatus(sessionId: string): Promise<BaseBranchDiffSummary> {
    const context = this.getSessionContext(sessionId)
    const base = await this.resolveBaseBranch(context)
    const comparisonPoint = await this.getComparisonPoint(
      context.session.working_directory,
      base,
    )
    const trackedFiles = await this.git.getNameStatusAgainstRef(
      context.session.working_directory,
      comparisonPoint,
    )
    const untrackedFiles = await this.git.getUntrackedFiles(
      context.session.working_directory,
    )

    return {
      base,
      files: mergeChangedFileLists(trackedFiles, untrackedFiles),
    }
  }

  async getBaseBranchDiff(input: BaseBranchDiffRequest): Promise<string> {
    const context = this.getSessionContext(input.sessionId)
    const base = await this.resolveBaseBranch(context)
    const comparisonPoint = await this.getComparisonPoint(
      context.session.working_directory,
      base,
    )

    return this.git.getDiffAgainstRef(
      context.session.working_directory,
      comparisonPoint,
      input.filePath,
    )
  }

  private getSessionContext(sessionId: string): SessionContextRow {
    const session = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(sessionId) as SessionRow | undefined

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const project = this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(session.project_id) as ProjectRow | undefined

    if (!project) {
      throw new Error(`Project not found: ${session.project_id}`)
    }

    const pullRequest = session.workspace_id
      ? ((this.db
          .prepare(
            'SELECT * FROM workspace_pull_requests WHERE workspace_id = ?',
          )
          .get(session.workspace_id) as WorkspacePullRequestRow | undefined) ??
        null)
      : null

    return {
      session,
      project,
      pullRequest,
    }
  }

  private async resolveBaseBranch(
    context: SessionContextRow,
  ): Promise<ResolvedBaseBranch> {
    const settings = normalizeProjectSettings(
      JSON.parse(context.project.settings),
    )
    const repoPath = context.session.working_directory
    const remoteDefaultBranch = await this.git.getRemoteDefaultBranch(repoPath)
    const conventionalBranch = await this.git.getFirstExistingBranch(repoPath, [
      'main',
      'master',
    ])
    const currentBranch = await this.git.getCurrentBranch(repoPath)
    const candidate = selectBaseBranchCandidate({
      pullRequestBaseBranch: context.pullRequest?.base_branch ?? null,
      projectBaseBranch: settings.workspaceCreation.baseBranchName,
      remoteDefaultBranch,
      conventionalBranch,
      currentBranch,
    })
    const comparisonRef = await this.git.resolveComparisonRef(
      repoPath,
      candidate.branchName,
    )
    const warning =
      candidate.source === 'current-branch'
        ? 'Base branch resolved to the current branch; this may not be a useful pull request comparison.'
        : null

    return {
      branchName: candidate.branchName,
      comparisonRef,
      source: candidate.source,
      warning,
    }
  }

  private async getComparisonPoint(
    repoPath: string,
    base: ResolvedBaseBranch,
  ): Promise<string> {
    try {
      return await this.git.getMergeBase(repoPath, base.comparisonRef, 'HEAD')
    } catch {
      base.warning =
        base.warning ??
        'Could not compute a merge base; comparing directly against the resolved base branch.'
      return base.comparisonRef
    }
  }
}
