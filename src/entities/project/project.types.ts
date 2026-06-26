import type { ProjectSettings } from './project-settings.pure'

export interface Project {
  id: string
  name: string
  repositoryPath: string
  settings: ProjectSettings
  createdAt: string
  updatedAt: string
}

export interface CloneProjectInput {
  remoteUrl: string
  parentDirectory: string
  directoryName?: string
  name?: string
}
