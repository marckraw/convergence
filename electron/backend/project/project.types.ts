import type { ProjectRow } from '../database/database.types'

export interface Project {
  id: string
  name: string
  repositoryPath: string
  settings: ProjectSettings
  createdAt: string
  updatedAt: string
}

export interface ProjectSettings {
  [key: string]: unknown
}

export interface CreateProjectInput {
  repositoryPath: string
  name?: string
}

export function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    repositoryPath: row.repository_path,
    settings: JSON.parse(row.settings) as ProjectSettings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
