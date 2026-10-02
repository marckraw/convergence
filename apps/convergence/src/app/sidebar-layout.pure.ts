/** The sidebar's width, in px: its floor, its ceiling and where it starts. */
export const MIN_SIDEBAR = 220
export const MAX_SIDEBAR = 400
export const DEFAULT_SIDEBAR = 260
/** The folded rail's width, in px. */
export const COLLAPSED_SIDEBAR = 56

/** How the sidebar was left: its width, and whether it was folded to the rail. */
export interface SidebarLayout {
  width: number
  collapsed: boolean
}

export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = {
  width: DEFAULT_SIDEBAR,
  collapsed: false,
}

const clampSidebarWidth = (width: number): number =>
  Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, Math.round(width)))

/**
 * How the sidebar was left, read back between launches (NAV-16). Storage
 * outlives code: a value this build can't read (an older format, a
 * hand-edited entry, half a string) reads as the default, so one bad line can
 * never leave the window without a sidebar. A width outside the range is
 * still a choice somebody made, honoured as far as the range allows.
 */
export function parseSidebarLayout(raw: string | null): SidebarLayout {
  if (raw === null) return DEFAULT_SIDEBAR_LAYOUT
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return DEFAULT_SIDEBAR_LAYOUT
  }
  if (typeof value !== 'object' || value === null) return DEFAULT_SIDEBAR_LAYOUT
  const { width, collapsed } = value as Partial<Record<string, unknown>>
  return {
    width:
      typeof width === 'number' && Number.isFinite(width)
        ? clampSidebarWidth(width)
        : DEFAULT_SIDEBAR,
    collapsed: collapsed === true,
  }
}

export function serializeSidebarLayout(layout: SidebarLayout): string {
  return JSON.stringify({
    width: clampSidebarWidth(layout.width),
    collapsed: layout.collapsed,
  })
}
