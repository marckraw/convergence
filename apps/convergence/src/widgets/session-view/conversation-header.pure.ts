/**
 * What a conversation header shows at a given width, and what yields into
 * "More" (MAR-3427 CH3).
 *
 * The header answers three questions at any width: which conversation this is
 * (the project and the conversation's name), what is happening (the live
 * status group), and how to stop it (a named Stop while it runs). Everything
 * else is a control that gives way, lowest priority first, in the one order
 * `HEADER_YIELD_ORDER` names, into the More menu.
 */

/** Where an item sits, which decides the rows at narrow widths (R5). */
export type HeaderItemGroup =
  | 'identity'
  | 'status'
  | 'stop'
  | 'more'
  | 'control'

export interface HeaderItem {
  id: string
  /** The item's natural width in px. Zero means it renders nothing. */
  width: number
  /**
   * The least it may be given; only the identity shrinks (its project name
   * truncates first, then the conversation name, down to the reserve).
   */
  minWidth?: number
  /** Lower yields first; pinned items ignore it. */
  priority: number
  pinned: boolean
  group: HeaderItemGroup
  /**
   * An item shown only when something has yielded (the chat header's More,
   * which has nothing of its own to offer).
   */
  onlyWithOverflow?: boolean
}

export interface HeaderLayout {
  /** Ids drawn in the header, in the items' order. */
  visible: string[]
  /** Ids moved into More, in the items' order. */
  overflow: string[]
  /**
   * Row 1, then the status rows when the header is narrow (R5). One row
   * means everything visible sits on row 1.
   */
  rows: string[][]
}

/**
 * The controls that yield, first to go first (R2). Anything absent from a
 * header is simply skipped; anything pinned never consults this list.
 */
export const HEADER_YIELD_ORDER = [
  'agent-meter',
  'pin',
  'terminal',
  'pull-request',
  'open',
  'project-actions',
  'view',
  'harness',
  'wires',
  'session-details',
  'parallel-work',
] as const

export type HeaderYieldId = (typeof HEADER_YIELD_ORDER)[number]

/** A yielding control's priority: its place in `HEADER_YIELD_ORDER`. */
export function headerYieldPriority(id: HeaderYieldId): number {
  return HEADER_YIELD_ORDER.indexOf(id)
}

/** The header's horizontal padding (`px-4` on each side). */
export const HEADER_PADDING_X = 32
/** The one gap between drawn items (`gap-1.5`). */
export const HEADER_GAP = 6
/**
 * Below this header width the status group takes its own row and every
 * control yields (R5): row 1 is identity + Stop + More, nothing else.
 */
export const HEADER_TWO_ROW_BELOW = 560
/** The conversation name's reserved minimum width (R1). */
export const CONVERSATION_NAME_RESERVED = 120
/** How far the project name may truncate before the conversation name does. */
export const PROJECT_NAME_MIN = 40
/**
 * The identity's comfortable width: controls yield to give the identity this
 * much (or its whole natural width, when that is less) before it truncates.
 */
export const IDENTITY_COMFORT = 280
/**
 * What sits between the project and the conversation name: the `/`
 * separator (`w-2`) and a `gap-1.5` on each side of it.
 */
export const IDENTITY_INNER_GAP = 20

export interface IdentityWidths {
  /** What the identity asks for before controls may stay. */
  width: number
  /** The least it may be given: the reserve, or less when the names are. */
  minWidth: number
  /** The project name's own floor, for its `min-width`. */
  projectMin: number
  /** The conversation name's own floor, for its `min-width`. */
  nameMin: number
}

/**
 * The identity's widths from its two names' natural widths. The project name
 * gives way first, down to `PROJECT_NAME_MIN`; the conversation name keeps
 * `CONVERSATION_NAME_RESERVED` (or all of itself, when shorter).
 *
 * `projectNatural: null` is a conversation with no project (a project-free
 * chat): no project part and no separator are drawn, so none is counted.
 */
export function identityWidths(input: {
  projectNatural: number | null
  nameNatural: number
  leading?: number
}): IdentityWidths {
  const leading = input.leading ?? 0
  const project = input.projectNatural
  const projectMin = project === null ? 0 : Math.min(project, PROJECT_NAME_MIN)
  const nameMin = Math.min(input.nameNatural, CONVERSATION_NAME_RESERVED)
  const projectPart = (width: number) =>
    project === null ? 0 : width + IDENTITY_INNER_GAP
  const natural = leading + projectPart(project ?? 0) + input.nameNatural
  const minWidth = leading + projectPart(projectMin) + nameMin
  return {
    width: Math.max(minWidth, Math.min(natural, IDENTITY_COMFORT)),
    minWidth,
    projectMin,
    nameMin,
  }
}

/** The width a row of items takes at the given identity width. */
function rowCost(items: HeaderItem[], useMin: boolean): number {
  const drawn = items.filter((item) => item.width > 0)
  if (drawn.length === 0) return 0
  const widths = drawn.reduce(
    (sum, item) => sum + (useMin ? (item.minWidth ?? item.width) : item.width),
    0,
  )
  return widths + HEADER_GAP * (drawn.length - 1)
}

/**
 * Greedy rows of the status group, each within the available width. A lone
 * item always takes a row of its own: every status item is capped (the
 * activity chip at 192 px, the harness pill at 240), so from the 320 px the
 * layout is held to, one item never overruns its row (MAR-3427 C).
 */
function packRows(items: HeaderItem[], available: number): HeaderItem[][] {
  const rows: HeaderItem[][] = []
  let current: HeaderItem[] = []
  for (const item of items) {
    if (item.width <= 0) continue
    const next = [...current, item]
    if (current.length > 0 && rowCost(next, true) > available) {
      rows.push(current)
      current = [item]
    } else current = next
  }
  if (current.length > 0) rows.push(current)
  return rows
}

/**
 * Decides what the header draws and what yields into More (R2), on how many
 * rows (R5), so that no drawn row is wider than the header (R3).
 *
 * `width` is the header's own measured width; `null` or zero means it has not
 * been laid out (jsdom, a hidden tab), and then everything is drawn on one row
 * as it always was. An item of width zero draws nothing, so it never yields:
 * a More entry for it would name a control that is not there.
 */
export function headerLayout(input: {
  width: number | null
  items: HeaderItem[]
}): HeaderLayout {
  const { items } = input
  const ids = (list: HeaderItem[]) => list.map((item) => item.id)
  const inOrder = (keep: Set<HeaderItem>) =>
    items.filter((item) => keep.has(item))

  if (input.width === null || input.width <= 0) {
    const drawn = items.filter((item) => !item.onlyWithOverflow)
    return { visible: ids(drawn), overflow: [], rows: [ids(drawn)] }
  }

  const available = input.width - HEADER_PADDING_X
  const pinned = items.filter((item) => item.pinned && !item.onlyWithOverflow)
  const conditional = items.filter((item) => item.onlyWithOverflow)
  const controls = items
    .filter((item) => !item.pinned && !item.onlyWithOverflow)
    .filter((item) => item.width > 0)
    .sort((left, right) => left.priority - right.priority)
  const absent = items.filter(
    (item) => !item.pinned && !item.onlyWithOverflow && item.width <= 0,
  )

  const oneRow =
    input.width >= HEADER_TWO_ROW_BELOW &&
    rowCost([...pinned, ...conditional], true) <= available

  if (oneRow) {
    // Everything fits without yielding: the conditional More stays away.
    if (rowCost([...pinned, ...controls], false) <= available) {
      const drawn = new Set([...pinned, ...controls, ...absent])
      return {
        visible: ids(inOrder(drawn)),
        overflow: [],
        rows: [ids(inOrder(drawn))],
      }
    }
    const kept = [...controls]
    const yielded: HeaderItem[] = []
    const withMore = [...pinned, ...conditional]
    while (
      kept.length > 0 &&
      rowCost([...withMore, ...kept], false) > available
    )
      yielded.push(kept.shift()!)
    const drawn = new Set([...withMore, ...kept, ...absent])
    return {
      visible: ids(inOrder(drawn)),
      overflow: ids(inOrder(new Set(yielded))),
      rows: [ids(inOrder(drawn))],
    }
  }

  // Two rows, on purpose (R5): who this is and how to stop it, then what is
  // happening. Every control yields; the status group never wraps into row 1.
  const first = items.filter(
    (item) =>
      (item.onlyWithOverflow ? controls.length > 0 : item.pinned) &&
      (item.group === 'identity' ||
        item.group === 'stop' ||
        item.group === 'more'),
  )
  const status = items.filter((item) => item.pinned && item.group === 'status')
  const statusRows = packRows(status, available)
  const drawn = new Set([...first, ...statusRows.flat()])
  return {
    visible: ids(inOrder(drawn)),
    overflow: ids(inOrder(new Set(controls))),
    rows: [ids(first), ...statusRows.map(ids)],
  }
}

/** A layout as a primitive, so a width change that keeps it renders nothing. */
export function headerLayoutKey(layout: HeaderLayout): string {
  return JSON.stringify(layout)
}

export function parseHeaderLayoutKey(key: string): HeaderLayout {
  return JSON.parse(key) as HeaderLayout
}
