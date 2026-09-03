import type { Project } from '../project/project.types'

export interface CreateLaneInput {
  rootProjectId: string
  laneName: string
  branchName: string
}

/**
 * The beats a lane creation passes through, in order, so a door can show
 * "copying" while the clone runs and "preparing branch" while git does.
 */
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

export type Lane = Project
