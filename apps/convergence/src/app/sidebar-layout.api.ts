import {
  DEFAULT_SIDEBAR_LAYOUT,
  parseSidebarLayout,
  serializeSidebarLayout,
  type SidebarLayout,
} from './sidebar-layout.pure'

const STORAGE_KEY = 'convergence-sidebar-layout'

/** The sidebar's width and fold between launches; a view preference only (NAV-16). */
export function loadSidebarLayout(): SidebarLayout {
  try {
    return parseSidebarLayout(localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_SIDEBAR_LAYOUT
  }
}

export function saveSidebarLayout(layout: SidebarLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeSidebarLayout(layout))
  } catch {
    // localStorage not available; the sidebar starts at its default next time.
  }
}
