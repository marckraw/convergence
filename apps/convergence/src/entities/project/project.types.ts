import type { ProjectSettings } from './project-settings.pure'

export interface Project {
  id: string
  name: string
  repositoryPath: string
  settings: ProjectSettings
  createdAt: string
  updatedAt: string
  /**
   * The root this project is a lane of, or null for a root (MAR-2783). A lane
   * IS a project: it is selected, opened and worked in like any other; these
   * two fields are only the visible tie back to its root.
   */
  laneOf: string | null
  /** The lane's name under its root; null for a root. */
  laneName: string | null
}

export interface CreateLaneInput {
  rootProjectId: string
  laneName: string
  branchName: string
}

export type LaneCreateProgressPhase =
  | 'copying'
  | 'preparing-branch'
  | 'recording'
  | 'done'

export interface LaneCreateProgress {
  rootProjectId: string
  laneName: string
  phase: LaneCreateProgressPhase
}

export type LaneCopyMethod = 'clonefile' | 'bytes'

export interface LaneCreateResult {
  lane: Project
  copyMethod: LaneCopyMethod
  /** What did not go to plan but did not stop the lane (an unreachable origin). */
  warnings: string[]
}

export interface CloneProjectInput {
  remoteUrl: string
  parentDirectory: string
  directoryName?: string
  name?: string
}
