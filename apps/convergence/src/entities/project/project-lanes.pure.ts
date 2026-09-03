import type { ProjectSettings } from './project-settings.pure'
import type { LaneCreateProgressPhase, Project } from './project.types'

export interface ProjectListEntry {
  project: Project
  /** 0 for a root, 1 for a lane under it. */
  depth: number
}

/**
 * The project list with every lane placed directly under its root, in the
 * root's order (MAR-2783, ruling 5).
 *
 * A lane whose root is not in the list is kept, at the top level: the record
 * cascades a root's deletion to its lanes, so this only happens to a list that
 * is momentarily stale, and a project that exists must stay selectable.
 */
export function orderProjectsWithLanes(
  projects: readonly Project[],
): ProjectListEntry[] {
  const ids = new Set(projects.map((project) => project.id))
  const lanesByRoot = new Map<string, Project[]>()
  for (const project of projects) {
    if (project.laneOf === null || !ids.has(project.laneOf)) continue
    const lanes = lanesByRoot.get(project.laneOf) ?? []
    lanes.push(project)
    lanesByRoot.set(project.laneOf, lanes)
  }

  const entries: ProjectListEntry[] = []
  for (const project of projects) {
    if (project.laneOf !== null && ids.has(project.laneOf)) continue
    entries.push({ project, depth: 0 })
    for (const lane of lanesByRoot.get(project.id) ?? []) {
      entries.push({ project: lane, depth: 1 })
    }
  }
  return entries
}

/** What the door says while a lane is being made. */
export function laneProgressLabel(
  phase: LaneCreateProgressPhase | null,
): string {
  switch (phase) {
    case 'copying':
      return 'Copying the project…'
    case 'preparing-branch':
      return 'Preparing the branch…'
    case 'recording':
      return 'Recording the lane…'
    case 'done':
      return 'Lane ready.'
    case null:
      return 'Starting…'
  }
}

/**
 * What the lane's branch is cut from, in the words of what the service does
 * (MAR-2783 round 2, L5): the project's base branch name when one is set --
 * the workspace start strategy is a workspace setting and plays no part --
 * else origin's default branch. When origin has no branch of that name the
 * service cuts from the local one, and the label says so (round 3, L3).
 */
export function laneBaseBranchLabel(settings: ProjectSettings): string {
  const base = settings.workspaceCreation.baseBranchName?.trim()
  return base
    ? `origin/${base}, or the local ${base} if origin has none`
    : "origin's default branch"
}
