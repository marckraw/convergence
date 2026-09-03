import type {
  CloneProjectInput,
  CreateLaneInput,
  LaneCreateProgress,
  LaneCreateResult,
  Project,
} from './project.types'
import type { ProjectSettings } from './project-settings.pure'

export const projectApi = {
  create: (input: {
    repositoryPath: string
    name?: string
  }): Promise<Project> => window.electronAPI.project.create(input),

  clone: (input: CloneProjectInput): Promise<Project> =>
    window.electronAPI.project.clone(input),

  getAll: (): Promise<Project[]> => window.electronAPI.project.getAll(),

  getById: (id: string): Promise<Project | null> =>
    window.electronAPI.project.getById(id),

  delete: (id: string): Promise<void> => window.electronAPI.project.delete(id),

  getActive: (): Promise<Project | null> =>
    window.electronAPI.project.getActive(),

  setActive: (id: string): Promise<void> =>
    window.electronAPI.project.setActive(id),

  updateSettings: (id: string, settings: ProjectSettings): Promise<Project> =>
    window.electronAPI.project.updateSettings(id, settings),
}

export const laneApi = {
  create: (input: CreateLaneInput): Promise<LaneCreateResult> =>
    window.electronAPI.lane.create(input),

  list: (rootProjectId: string): Promise<Project[]> =>
    window.electronAPI.lane.list(rootProjectId),

  reveal: (projectId: string): Promise<void> =>
    window.electronAPI.lane.reveal(projectId),

  onProgress: (
    callback: (progress: LaneCreateProgress) => void,
  ): (() => void) => window.electronAPI.lane.onProgress(callback),
}

export const dialogApi = {
  selectDirectory: (): Promise<string | null> =>
    window.electronAPI.dialog.selectDirectory(),

  selectCloneParentDirectory: (): Promise<string | null> =>
    window.electronAPI.dialog.selectCloneParentDirectory(),
}
