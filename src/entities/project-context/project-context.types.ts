export type ProjectContextReinjectMode = 'boot' | 'every-turn'

export interface ProjectContextItem {
  id: string
  projectId: string
  label: string | null
  body: string
  reinjectMode: ProjectContextReinjectMode
  createdAt: string
  updatedAt: string
}

export interface CreateProjectContextItemInput {
  projectId: string
  label?: string | null
  body: string
  reinjectMode: ProjectContextReinjectMode
}

export interface UpdateProjectContextItemInput {
  label?: string | null
  body?: string
  reinjectMode?: ProjectContextReinjectMode
}
