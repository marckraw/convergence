import { existsSync, statSync } from 'fs'
import { basename, resolve } from 'path'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { ProjectRow } from '../database/database.types'
import type { WorkspaceService } from '../workspace/workspace.service'
import {
  DEFAULT_PROJECT_SETTINGS,
  normalizeProjectSettings,
  type ProjectSettings,
} from './project-settings.pure'
import {
  projectFromRow,
  type Project,
  type CreateProjectInput,
} from './project.types'

export class ProjectService {
  private workspaceService: WorkspaceService | null = null

  constructor(private db: Database.Database) {}

  setWorkspaceService(ws: WorkspaceService): void {
    this.workspaceService = ws
  }

  create(input: CreateProjectInput): Project {
    const resolvedPath = resolve(input.repositoryPath)

    this.validateRepositoryPath(resolvedPath)

    const existing = this.findRowByRepositoryPath(resolvedPath)

    if (existing) {
      return projectFromRow(existing)
    }

    const id = randomUUID()
    const name = input.name ?? basename(resolvedPath)

    this.db
      .prepare(
        `INSERT INTO projects (id, name, repository_path, settings)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, name, resolvedPath, JSON.stringify(DEFAULT_PROJECT_SETTINGS))

    const row = this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(id) as ProjectRow

    return projectFromRow(row)
  }

  getAll(): Project[] {
    const rows = this.db
      .prepare('SELECT * FROM projects ORDER BY created_at DESC')
      .all() as ProjectRow[]

    return rows.map(projectFromRow)
  }

  getById(id: string): Project | null {
    const row = this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(id) as ProjectRow | undefined

    return row ? projectFromRow(row) : null
  }

  updateSettings(id: string, settings: ProjectSettings): Project {
    const existing = this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(id) as ProjectRow | undefined

    if (!existing) {
      throw new Error(`Project not found: ${id}`)
    }

    const normalizedSettings = normalizeProjectSettings(settings)

    this.db
      .prepare(
        `UPDATE projects
         SET settings = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(JSON.stringify(normalizedSettings), id)

    const updated = this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(id) as ProjectRow

    return projectFromRow(updated)
  }

  /**
   * The lanes spawned from one root, oldest first (MAR-2783).
   *
   * Keyed by `lane_of` rather than by walking `getAll()`, because the sidebar
   * asks this per root and the answer must not depend on how the flat list
   * happens to be ordered.
   */
  listLanes(rootId: string): Project[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM projects WHERE lane_of = ? ORDER BY created_at ASC, rowid ASC',
      )
      .all(rootId) as ProjectRow[]

    return rows.map(projectFromRow)
  }

  /**
   * The root a project belongs to: itself for a root, its parent for a lane.
   *
   * Null only when a lane's root row is gone, which the cascade makes
   * unreachable through the record; it is kept as a real answer rather than a
   * throw because a caller holding a stale `Project` value can still ask.
   */
  getRoot(project: Project): Project | null {
    if (project.laneOf === null) return project
    return this.getById(project.laneOf)
  }

  getByRepositoryPath(repositoryPath: string): Project | null {
    const resolvedPath = resolve(repositoryPath)
    const row = this.findRowByRepositoryPath(resolvedPath)
    return row ? projectFromRow(row) : null
  }

  /**
   * Refuses a root that still has lanes (MAR-2783 round 2, M4): the record's
   * cascade would take the lane rows, their sessions and their workspaces,
   * while the lane folders stayed on disk with nothing pointing at them.
   * Lanes go first, one by one (L2's delete-lane); then the root.
   */
  async delete(id: string): Promise<void> {
    const laneCount = this.listLanes(id).length
    if (laneCount > 0) {
      throw new Error(
        `This project has ${laneCount} lane${laneCount === 1 ? '' : 's'}. Delete or move its ${laneCount} lane${laneCount === 1 ? '' : 's'} first.`,
      )
    }
    if (this.workspaceService) {
      await this.workspaceService.deleteAllForProject(id)
    }
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  private validateRepositoryPath(path: string): void {
    if (!existsSync(path)) {
      throw new Error(`Path does not exist: ${path}`)
    }

    const stat = statSync(path)
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${path}`)
    }

    const gitPath = `${path}/.git`
    if (!existsSync(gitPath)) {
      throw new Error(`Not a git repository: ${path}`)
    }
  }

  private findRowByRepositoryPath(repositoryPath: string): ProjectRow | null {
    const row = this.db
      .prepare('SELECT * FROM projects WHERE repository_path = ?')
      .get(repositoryPath) as ProjectRow | undefined

    return row ?? null
  }
}
