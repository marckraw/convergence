import { join } from 'path'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { WorkspaceRow } from '../database/database.types'
import { GitService } from '../git/git.service'
import { normalizeProjectSettings } from '../project/project-settings.pure'
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

    const branchExists = await this.git.branchExists(repoPath, input.branchName)
    const createBranch = !branchExists
    const overrideBaseBranch = input.baseBranch?.trim() || null
    const useBaseBranchStart =
      overrideBaseBranch !== null ||
      settings.workspaceCreation.startStrategy === 'base-branch'
    const startPoint =
      createBranch && useBaseBranchStart
        ? await this.git.resolveBaseBranchStartPoint(
            repoPath,
            overrideBaseBranch ?? settings.workspaceCreation.baseBranchName,
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

  listAll(): Workspace[] {
    const rows = this.db
      .prepare('SELECT * FROM workspaces ORDER BY created_at DESC')
      .all() as WorkspaceRow[]

    return rows.map(workspaceFromRow)
  }

  getByProjectIdAndBranch(
    projectId: string,
    branchName: string,
  ): Workspace | null {
    const row = this.db
      .prepare(
        'SELECT * FROM workspaces WHERE project_id = ? AND branch_name = ?',
      )
      .get(projectId, branchName) as WorkspaceRow | undefined

    return row ? workspaceFromRow(row) : null
  }

  async archive(input: {
    id: string
    removeWorktree?: boolean
  }): Promise<Workspace> {
    const row = this.getRowById(input.id)
    if (!row) throw new Error(`Workspace not found: ${input.id}`)

    const archivedAt = row.archived_at ?? new Date().toISOString()
    let worktreeRemovedAt = row.worktree_removed_at

    if (input.removeWorktree && !worktreeRemovedAt) {
      worktreeRemovedAt = await this.removePhysicalWorktree(row)
    }

    const applyArchive = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE workspaces
           SET archived_at = ?, worktree_removed_at = ?
           WHERE id = ?`,
        )
        .run(archivedAt, worktreeRemovedAt, row.id)

      this.db
        .prepare(
          `UPDATE sessions
           SET archived_at = COALESCE(archived_at, ?),
               updated_at = datetime('now')
           WHERE workspace_id = ?`,
        )
        .run(archivedAt, row.id)
    })

    applyArchive()
    return workspaceFromRow(this.getRowById(row.id)!)
  }

  async removeWorktree(id: string): Promise<Workspace> {
    const row = this.getRowById(id)
    if (!row) throw new Error(`Workspace not found: ${id}`)

    if (row.worktree_removed_at) {
      return workspaceFromRow(row)
    }

    const worktreeRemovedAt = await this.removePhysicalWorktree(row)
    this.db
      .prepare('UPDATE workspaces SET worktree_removed_at = ? WHERE id = ?')
      .run(worktreeRemovedAt, id)

    return workspaceFromRow(this.getRowById(id)!)
  }

  unarchive(id: string): Workspace {
    const row = this.getRowById(id)
    if (!row) throw new Error(`Workspace not found: ${id}`)

    const workspaceArchivedAt = row.archived_at
    const applyUnarchive = this.db.transaction(() => {
      this.db
        .prepare('UPDATE workspaces SET archived_at = NULL WHERE id = ?')
        .run(id)

      if (workspaceArchivedAt) {
        this.db
          .prepare(
            `UPDATE sessions
             SET archived_at = NULL,
                 updated_at = datetime('now')
             WHERE workspace_id = ? AND archived_at = ?`,
          )
          .run(id, workspaceArchivedAt)
      }
    })

    applyUnarchive()
    return workspaceFromRow(this.getRowById(id)!)
  }

  async delete(id: string): Promise<void> {
    const row = this.getRowById(id)

    if (!row) return

    const project = this.getProjectRepository(row.project_id)

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

  private async removePhysicalWorktree(row: WorkspaceRow): Promise<string> {
    const project = this.getProjectRepository(row.project_id)
    if (!project) {
      throw new Error(
        `Cannot remove worktree for workspace ${row.id}: project not found`,
      )
    }

    await this.git.removeWorktree(project.repository_path, row.path)
    return new Date().toISOString()
  }

  private getRowById(id: string): WorkspaceRow | null {
    const row = this.db
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(id) as WorkspaceRow | undefined

    return row ?? null
  }

  private getProjectRepository(
    projectId: string,
  ): { repository_path: string } | null {
    const project = this.db
      .prepare('SELECT repository_path FROM projects WHERE id = ?')
      .get(projectId) as { repository_path: string } | undefined

    return project ?? null
  }
}
