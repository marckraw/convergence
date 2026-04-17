import type { ProjectRow } from '../database/database.types'
import {
  normalizeProjectSettings,
  type ProjectSettings,
} from './project-settings.pure'

export interface Project {
  id: string
  name: string
  repositoryPath: string
  settings: ProjectSettings
  createdAt: string
  updatedAt: string
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
    settings: normalizeProjectSettings(JSON.parse(row.settings) as unknown),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
