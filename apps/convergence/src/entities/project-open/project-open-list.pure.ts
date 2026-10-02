import type { ProjectOpenApp } from './project-open.types'

/** While the apps are still being looked for. */
export const DETECTING_APPS_LABEL = 'Detecting apps…'

/** When none of the apps Convergence knows is installed. */
export const NO_APPS_FOUND_LABEL = 'No supported apps found'

/**
 * An app in an "Open in" list, named for where it opens: "Open in Cursor",
 * "Open in Finder". One rule for every list (NAV-25), so the header's Open
 * menu, the Project panel and a skill's Open menu read alike.
 */
export function openInLabel(app: Pick<ProjectOpenApp, 'label'>): string {
  return `Open in ${app.label}`
}

/**
 * What an "Open in" list says in place of its apps, or null while it lists
 * them: one failure behaviour for every list (NAV-25, DLG-29). A reason it
 * can't open at all comes first, then the search, then an empty result.
 */
export function projectOpenNote(input: {
  apps: readonly ProjectOpenApp[]
  loading: boolean
  unavailableReason?: string | null
}): string | null {
  if (input.unavailableReason) return input.unavailableReason
  if (input.loading) return DETECTING_APPS_LABEL
  if (input.apps.length === 0) return NO_APPS_FOUND_LABEL
  return null
}
