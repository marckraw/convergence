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
  /**
   * The root project this one is a lane of, or null for a root (MAR-2783,
   * ruling 1). A lane IS a project: everything keyed by project id works in it
   * unchanged; these two fields are only the visible tie back to its root.
   */
  laneOf: string | null
  /** The lane's name under its root; null for a root. */
  laneName: string | null
}

export interface CreateProjectInput {
  repositoryPath: string
  name?: string
}

export interface CloneProjectInput {
  remoteUrl: string
  parentDirectory: string
  directoryName?: string
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
    laneOf: row.lane_of ?? null,
    laneName: row.lane_name ?? null,
  }
}
