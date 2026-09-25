import type { Project } from './project.types'

/**
 * A project's name by id, as a store selector (MAR-3427 CH3 R1).
 *
 * The conversation header names the project a session belongs to, which is
 * not always the one selected in the sidebar. Reading `activeProject` there
 * named the wrong project for every conversation opened from elsewhere.
 * Returns a string, so a subscriber redraws only when the name changes.
 *
 * `null` for no id (a project-free chat) and for an id the list does not
 * hold; the caller says what that reads as.
 */
export const selectProjectName =
  (projectId: string | null) =>
  (state: {
    projects: readonly Pick<Project, 'id' | 'name'>[]
  }): string | null =>
    projectId === null
      ? null
      : (state.projects.find((project) => project.id === projectId)?.name ??
        null)
