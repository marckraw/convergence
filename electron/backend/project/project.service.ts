import { existsSync, statSync } from 'fs'
import { basename, resolve } from 'path'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { ProjectRow } from '../database/database.types'
import type { WorkspaceService } from '../workspace/workspace.service'
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
         VALUES (?, ?, ?, '{}')`,
      )
      .run(id, name, resolvedPath)

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

  getByRepositoryPath(repositoryPath: string): Project | null {
    const resolvedPath = resolve(repositoryPath)
    const row = this.findRowByRepositoryPath(resolvedPath)
    return row ? projectFromRow(row) : null
  }

  async delete(id: string): Promise<void> {
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
