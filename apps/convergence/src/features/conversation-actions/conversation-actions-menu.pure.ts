import {
  resolveContextDrillAction,
  type DrillBeat,
  type DrillDescription,
} from '@/entities/context-drill'
import type {
  ConversationAction,
  ConversationRoutineAction,
} from '@/entities/conversation-actions'
import { COMPACTING_CONTEXT_LABEL } from '@/entities/session'
import {
  filterComposerSkills,
  type ProjectSkillCatalog,
} from '@/entities/skill'

/** Where the menu is: closed, the fan, or one group's compact list. */
export type ActionsMenuLevel =
  | 'closed'
  | 'fan'
  | 'skills'
  | 'routines'
  | 'project'

export type ActionsMenuGroup = Exclude<ActionsMenuLevel, 'closed' | 'fan'>

/**
 * The frames' words for each routine, keyed by id (MAR-3393 Words). CA1's
 * backend label is shorter for the hand-off ("Hand off"); the menu maps by
 * id and never by label.
 */
export const ROUTINE_LABELS: Record<ConversationRoutineAction['id'], string> = {
  drill: 'Run the drill',
  compact: 'Compact',
  fork: 'Fork',
  'hand-off': 'Hand off to another account',
}

export const SKILLS_LOADING_LABEL = 'Loading skills…'
export const SKILLS_EMPTY_LABEL = 'No skills available for this agent'

export function skillsFailedLabel(message: string): string {
  return `Couldn't load this agent's skills: ${message}`
}

/**
 * Whether the Actions button belongs on this conversation surface (R1): only
 * where the composer renders for this very session.
 */
export function conversationActionsAvailable(input: {
  session: { id: string; providerId: string; primarySurface?: string | null }
  composerContext: { activeSessionId: string | null } | null
  composerDisabledReason: string | null
}): boolean {
  const { session, composerContext, composerDisabledReason } = input
  if (composerDisabledReason) return false
  if (!composerContext) return false
  if (composerContext.activeSessionId !== session.id) return false
  if (session.providerId === 'shell') return false
  if (session.primarySurface === 'terminal') return false
  return true
}

/** Esc goes back one level: list → fan → closed (R6). */
export function levelAfterEscape(level: ActionsMenuLevel): ActionsMenuLevel {
  if (level === 'fan' || level === 'closed') return 'closed'
  return 'fan'
}

/**
 * The next roving-focus index for a traversal key, or null when the key is
 * not one (R6). Arrows wrap; Home and End jump.
 */
export function nextFocusIndex(
  key: string,
  index: number,
  count: number,
): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return index < 0 ? 0 : (index + 1) % count
    case 'ArrowUp':
    case 'ArrowLeft':
      return index < 0 ? count - 1 : (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

export type SkillListState =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'empty' }
  | { kind: 'listed' }

/**
 * Loading, failure and empty told apart for THIS agent's provider (R3).
 *
 * Failure outranks everything, because a failed scan must never read as
 * "no skills". A catalog read for another project or chat is not this one's
 * answer, and reads as still loading.
 */
export function resolveSkillListState(input: {
  catalog: ProjectSkillCatalog | null
  catalogId: string
  isCatalogLoading: boolean
  loadingProviderIds: readonly string[]
  catalogError: string | null
  failedProviders: Readonly<Record<string, string>>
  providerId: string
}): SkillListState {
  const failed = input.failedProviders[input.providerId]
  if (failed !== undefined) return { kind: 'failed', message: failed }
  if (input.catalogError !== null) {
    return { kind: 'failed', message: input.catalogError }
  }
  const catalog =
    input.catalog && input.catalog.projectId === input.catalogId
      ? input.catalog
      : null
  const provider = catalog?.providers.find(
    (candidate) => candidate.providerId === input.providerId,
  )
  if (provider?.error && provider.skills.length === 0) {
    return { kind: 'failed', message: provider.error }
  }
  if (provider && provider.skills.length > 0) return { kind: 'listed' }
  if (
    !catalog ||
    input.loadingProviderIds.includes(input.providerId) ||
    (input.isCatalogLoading && input.loadingProviderIds.length === 0)
  ) {
    return { kind: 'loading' }
  }
  return { kind: 'empty' }
}

export type SkillAction = Extract<ConversationAction, { kind: 'skill' }>

/**
 * CA1's skill actions, in CA1's order, narrowed by the composer's own query
 * rule (R2). The rows stay CA1's; the query only decides which remain.
 */
export function visibleSkillActions(input: {
  actions: readonly ConversationAction[]
  catalog: ProjectSkillCatalog | null
  providerId: string
  query: string
}): SkillAction[] {
  const matching = new Set(
    filterComposerSkills({
      catalog: input.catalog,
      providerId: input.providerId,
      query: input.query,
    }).map((entry) => entry.id),
  )
  return input.actions.filter(
    (action): action is SkillAction =>
      action.kind === 'skill' && matching.has(action.skill.id),
  )
}

export interface RoutineProgressView {
  label: string
  /** Null where no cancel exists at all (a compaction outside a drill). */
  cancel: { enabled: boolean; reason: string | null } | null
}

export interface RoutineRowView {
  id: ConversationRoutineAction['id']
  label: string
  offered: boolean
  reason: string | null
  progress: RoutineProgressView | null
}

/**
 * The Routines list as drawn (R4/R5).
 *
 * A running drill's beat outranks CA1's answer, through the one resolver the
 * context dot also calls: a conversation mid-drill is mid-turn, so `describe`
 * says "not offered", and a row that obeyed it would take its own Cancel
 * with it. A compaction outside a drill shows the shared compacting label
 * and no Cancel, because none exists.
 */
export function resolveRoutineRows(input: {
  routines: readonly ConversationRoutineAction[]
  drillBeat: DrillBeat | null
  drillDescription: DrillDescription | undefined
  compacting: boolean
}): RoutineRowView[] {
  const { routines, drillBeat, drillDescription, compacting } = input
  const rows: RoutineRowView[] = routines.map((routine) => ({
    id: routine.id,
    label: ROUTINE_LABELS[routine.id],
    offered: routine.offered,
    reason: routine.offered ? null : (routine.reason ?? null),
    progress: null,
  }))
  if (drillBeat !== null) {
    const drill = resolveContextDrillAction(drillDescription, drillBeat)
    const progress: RoutineProgressView = {
      label: drill.label,
      cancel: drill.cancel.visible
        ? { enabled: drill.cancel.enabled, reason: drill.cancel.reason }
        : null,
    }
    const row = rows.find((candidate) => candidate.id === 'drill')
    if (row) {
      row.offered = false
      row.reason = null
      row.progress = progress
    } else {
      rows.unshift({
        id: 'drill',
        label: ROUTINE_LABELS.drill,
        offered: false,
        reason: null,
        progress,
      })
    }
    return rows
  }
  if (compacting) {
    const row = rows.find((candidate) => candidate.id === 'compact')
    if (row) {
      row.offered = false
      row.reason = null
      row.progress = { label: COMPACTING_CONTEXT_LABEL, cancel: null }
    }
  }
  return rows
}

export const ACTIONS_PANEL_WIDTH = 286
export const ACTIONS_PANEL_MARGIN = 8
export const ACTIONS_PANEL_GAP = 12

export interface RectLike {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ActionsPanelPlacement {
  /** CSS `right`, relative to the anchor's box. */
  right: number
  /** CSS `bottom`, relative to the anchor's box. */
  bottom: number
  width: number
  maxHeight: number
}

/**
 * Where a group's compact list goes (R1): 286 wide, growing upward from the
 * button, right-aligned to it, and clamped inside the surface with an 8 px
 * margin on every side. A list taller than the room scrolls inside.
 */
export function placeActionsPanel(input: {
  boundary: RectLike
  anchor: RectLike
}): ActionsPanelPlacement {
  const { boundary, anchor } = input
  const margin = ACTIONS_PANEL_MARGIN
  const width = Math.max(
    0,
    Math.min(ACTIONS_PANEL_WIDTH, boundary.right - boundary.left - 2 * margin),
  )
  const rightEdge = Math.max(
    boundary.left + margin + width,
    Math.min(anchor.right, boundary.right - margin),
  )
  return {
    right: anchor.right - rightEdge,
    bottom: anchor.bottom - anchor.top + ACTIONS_PANEL_GAP,
    width,
    maxHeight: Math.max(
      0,
      anchor.top - ACTIONS_PANEL_GAP - (boundary.top + margin),
    ),
  }
}
