import type { ProjectContextItemRow } from '../database/database.types'
import type { SerializableProjectContextItem } from './project-context-serializer.pure'

export type ReinjectMode = 'boot' | 'every-turn'

export interface ProjectContextItem {
  id: string
  projectId: string
  label: string | null
  body: string
  reinjectMode: ReinjectMode
  createdAt: string
  updatedAt: string
}

export interface CreateProjectContextItemInput {
  projectId: string
  label?: string | null
  body: string
  reinjectMode: ReinjectMode
}

export interface UpdateProjectContextItemInput {
  label?: string | null
  body?: string
  reinjectMode?: ReinjectMode
}

function parseReinjectMode(value: string): ReinjectMode {
  return value === 'every-turn' ? 'every-turn' : 'boot'
}

export function projectContextItemFromRow(
  row: ProjectContextItemRow,
): ProjectContextItem {
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    body: row.body,
    reinjectMode: parseReinjectMode(row.reinject_mode),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function projectContextItemToSerializable(
  item: ProjectContextItem,
): SerializableProjectContextItem {
  return {
    label: item.label,
    body: item.body,
    reinjectMode: item.reinjectMode,
  }
}
