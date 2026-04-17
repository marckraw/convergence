import type { ProjectSettings } from './project-settings.pure'

export interface Project {
  id: string
  name: string
  repositoryPath: string
  settings: ProjectSettings
  createdAt: string
  updatedAt: string
}
