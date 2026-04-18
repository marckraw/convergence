import { join } from 'path'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { WorkspaceRow } from '../database/database.types'
import { GitService } from '../git/git.service'
import { normalizeProjectSettings } from '../project/project-settings.pure'
import { validateBranchNameForPlatform } from './branch-name-validation.pure'
import { checkWorktreePathLength } from './long-path.pure'
import {
  workspaceFromRow,
  type Workspace,
  type CreateWorkspaceInput,
} from './workspace.types'

export class WorkspaceService {
  constructor(
    private db: Database.Database,
    private git: GitService,
    private workspacesRoot: string,
  ) {}

  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    const validation = validateBranchNameForPlatform(
      input.branchName,
      process.platform,
    )
    if (!validation.valid) {
      throw new Error(validation.reason)
    }

    const project = this.db
      .prepare('SELECT repository_path, settings FROM projects WHERE id = ?')
      .get(input.projectId) as
      | { repository_path: string; settings: string }
      | undefined

    if (!project) {
      throw new Error(`Project not found: ${input.projectId}`)
    }

    const repoPath = project.repository_path
    const settings = normalizeProjectSettings(JSON.parse(project.settings))
    const id = randomUUID()
    const worktreePath = join(this.workspacesRoot, input.projectId, id)

    const pathCheck = checkWorktreePathLength(worktreePath, process.platform)
    if (pathCheck.exceedsLimit && pathCheck.message) {
      console.warn(`[workspace] ${pathCheck.message}`)
    }

    const branchExists = await this.git.branchExists(repoPath, input.branchName)
    const createBranch = !branchExists
    const startPoint =
      createBranch && settings.workspaceCreation.startStrategy === 'base-branch'
        ? await this.git.resolveBaseBranchStartPoint(
            repoPath,
            settings.workspaceCreation.baseBranchName,
          )
        : undefined

    await this.git.addWorktree(
      repoPath,
      worktreePath,
      input.branchName,
      createBranch,
      startPoint,
    )

    this.db
      .prepare(
        `INSERT INTO workspaces (id, project_id, branch_name, path, type)
         VALUES (?, ?, ?, ?, 'worktree')`,
      )
      .run(id, input.projectId, input.branchName, worktreePath)

    const row = this.db
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(id) as WorkspaceRow

    return workspaceFromRow(row)
  }

  getByProjectId(projectId: string): Workspace[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM workspaces WHERE project_id = ? ORDER BY created_at DESC',
      )
      .all(projectId) as WorkspaceRow[]

    return rows.map(workspaceFromRow)
  }

  async delete(id: string): Promise<void> {
    const row = this.db
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(id) as WorkspaceRow | undefined

    if (!row) return

    const project = this.db
      .prepare('SELECT repository_path FROM projects WHERE id = ?')
      .get(row.project_id) as { repository_path: string } | undefined

    if (project) {
      await this.git.removeWorktree(project.repository_path, row.path)
    }

    this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
  }

  async deleteAllForProject(projectId: string): Promise<void> {
    const workspaces = this.getByProjectId(projectId)
    for (const ws of workspaces) {
      await this.delete(ws.id)
    }
  }
}
